const mysql = require('mysql2/promise');
const path = require('path');
const { isAccountStaff } = require('../utils/accessControl');

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0
});

const OFFICIAL_FACULTIES = [
    'Facultad de Ingeniería',
    'Facultad de Ciencias Jurídicas, Contables y Sociales',
    'Facultad de Ciencias de la Salud'
];

async function inTransaction(callback) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const result = await callback(connection);
        await connection.commit();
        return result;
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
}

async function writeHistory(connection, incidence, userId, action, previousState, nextState, comment) {
    await connection.execute(
        `INSERT INTO historial_tickets
            (ticket_id, incidencia_id, usuario_id, accion, estado_anterior, estado_nuevo, comentario, fecha)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [incidence.ticket_id, incidence.id, userId, action, previousState, nextState, comment]
    );
}

async function getPlatforms() {
    const [rows] = await pool.execute(
        `SELECT id, nombre, descripcion, activo, fecha_creacion
         FROM plataformas
         WHERE activo = TRUE
         ORDER BY nombre`
    );
    return rows;
}

async function getFaculties() {
    const [rows] = await pool.execute(
        'SELECT id, nombre FROM facultades WHERE nombre IN (?, ?, ?) ORDER BY FIELD(nombre, ?, ?, ?)',
        [...OFFICIAL_FACULTIES, ...OFFICIAL_FACULTIES]
    );
    return rows;
}

async function createPlatform({ nombre, descripcion, activo }) {
    const [result] = await pool.execute(
        'INSERT INTO plataformas (nombre, descripcion, activo) VALUES (?, ?, ?)',
        [nombre, descripcion, activo]
    );
    const [rows] = await pool.execute(
        'SELECT id, nombre, descripcion, activo, fecha_creacion FROM plataformas WHERE id = ?',
        [result.insertId]
    );
    return rows[0];
}

async function createIncident(data) {
    try {
        return await inTransaction(async connection => {
        const [platforms] = await connection.execute(
            'SELECT id FROM plataformas WHERE id = ? AND activo = TRUE',
            [data.plataforma_id]
        );
        if (!platforms.length) {
            const err = new Error('La plataforma no existe, está inactiva o no pertenece al catálogo oficial');
            err.status = 400;
            throw err;
        }

        if (data.oficina_id !== null) {
            const [offices] = await connection.execute(
                'SELECT id FROM oficinas WHERE id = ? AND activo = TRUE',
                [data.oficina_id]
            );
            if (!offices.length) {
                const err = new Error('La oficina no existe o está inactiva');
                err.status = 400;
                throw err;
            }
        }

        if (data.ticket_id !== null) {
            const [tickets] = await connection.execute('SELECT id, user_id FROM tickets WHERE id = ?', [data.ticket_id]);
            if (!tickets.length) {
                const err = new Error('El ticket relacionado no existe');
                err.status = 400;
                throw err;
            }
            if (!isAccountStaff({ id: data.usuario_id, rol: data.user_role }) &&
                Number(tickets[0].user_id) !== Number(data.usuario_id)) {
                const err = new Error('No tienes permiso para vincular ese ticket');
                err.status = 403;
                throw err;
            }
        }

        const [result] = await connection.execute(
            `INSERT INTO incidencias_cuentas
                (ticket_id, plataforma_id, usuario_id, tipo_usuario, dni_codigo, nombres, apellidos,
                 correo_alternativo, telefono, facultad, oficina_id, tipo_problema, descripcion, estado, prioridad,
                 idempotency_key, idempotency_hash)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NUEVO', ?, ?, ?)`,
            [
                data.ticket_id,
                data.plataforma_id,
                data.usuario_id,
                data.tipo_usuario,
                data.dni_codigo,
                data.nombres,
                data.apellidos,
                data.correo_alternativo,
                data.telefono,
                data.facultad,
                data.oficina_id,
                data.tipo_problema,
                data.descripcion,
                data.prioridad,
                data.idempotency_key,
                data.idempotency_hash
            ]
        );
        const incidence = { id: result.insertId, ticket_id: data.ticket_id };
        await writeHistory(
            connection,
            incidence,
            data.usuario_id,
            'CREACION',
            null,
            'NUEVO',
            'Incidencia de cuenta institucional creada'
        );

        if (data.file) {
            await connection.execute(
                `INSERT INTO incidencia_cuenta_evidencias
                    (incidencia_id, usuario_id, tipo, nombre_original, nombre_archivo, tipo_mime, tamano_bytes)
                 VALUES (?, ?, 'EVIDENCIA_INICIAL', ?, ?, ?, ?)`,
                [
                    result.insertId,
                    data.usuario_id,
                    path.basename(data.file.originalname).slice(0, 255),
                    data.file.filename,
                    data.file.mimetype,
                    data.file.size
                ]
            );
        }
        return { id: result.insertId };
        });
    } catch (err) {
        if (err.code !== 'ER_DUP_ENTRY') throw err;
        const [rows] = await pool.execute(
            'SELECT id, idempotency_hash FROM incidencias_cuentas WHERE usuario_id = ? AND idempotency_key = ?',
            [data.usuario_id, data.idempotency_key]
        );
        if (!rows.length) throw err;
        if (rows[0].idempotency_hash !== data.idempotency_hash) {
            const conflict = new Error('La clave de reintento ya se usó con datos distintos. Inicia una nueva solicitud.');
            conflict.status = 409;
            throw conflict;
        }
        return { id: rows[0].id, replayed: true };
    }
}

async function listIncidents({ user, staffRoles, filters, values }) {
    const conditions = [...filters];
    const params = [...values];
    if (!staffRoles.has(String(user.rol || '').toLowerCase())) {
        conditions.unshift('ic.usuario_id = ?');
        params.unshift(user.id);
    }
    const [rows] = await pool.execute(
        `SELECT ic.id, ic.ticket_id, ic.plataforma_id, p.nombre AS plataforma,
                ic.usuario_id, ic.tipo_usuario, ic.dni_codigo, ic.nombres, ic.apellidos,
                ic.tipo_problema, ic.descripcion, ic.estado, ic.prioridad,
                o.nombre AS oficina,
                ic.fecha_creacion, ic.fecha_resolucion
         FROM incidencias_cuentas ic
         INNER JOIN plataformas p ON p.id = ic.plataforma_id
         LEFT JOIN oficinas o ON o.id = ic.oficina_id
         ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
         ORDER BY ic.fecha_creacion DESC`,
        params
    );
    return rows;
}

async function getIncident(id) {
    const [rows] = await pool.execute(
        `SELECT ic.*, p.nombre AS plataforma,
                o.nombre AS oficina,
                t.titulo AS ticket_titulo, t.estado AS ticket_estado, t.prioridad AS ticket_prioridad
         FROM incidencias_cuentas ic
         INNER JOIN plataformas p ON p.id = ic.plataforma_id
         LEFT JOIN oficinas o ON o.id = ic.oficina_id
         LEFT JOIN tickets t ON t.id = ic.ticket_id
         WHERE ic.id = ?`,
        [id]
    );
    if (!rows.length) return null;

    const [evidencias, historial, escalamientos] = await Promise.all([
        pool.execute(
            `SELECT id, tipo, nombre_original, tipo_mime, tamano_bytes, fecha_creacion
             FROM incidencia_cuenta_evidencias WHERE incidencia_id = ? ORDER BY fecha_creacion`,
            [id]
        ),
        pool.execute(
            `SELECT id, usuario_id, accion, estado_anterior, estado_nuevo, comentario, fecha
             FROM historial_tickets WHERE incidencia_id = ? ORDER BY fecha`,
            [id]
        ),
        pool.execute(
            `SELECT id, origen, destino, motivo, usuario_escalo, fecha_escalamiento, fecha_resolucion, estado
             FROM escalamientos WHERE incidencia_id = ? ORDER BY fecha_escalamiento`,
            [id]
        )
    ]);
    const incidence = rows[0];
    const ticket = incidence.ticket_id ? {
        id: incidence.ticket_id,
        titulo: incidence.ticket_titulo,
        estado: incidence.ticket_estado,
        prioridad: incidence.ticket_prioridad
    } : null;
    return {
        incidencia: incidence,
        ticket,
        evidencias: evidencias[0],
        historial: historial[0],
        escalamientos: escalamientos[0]
    };
}

async function getEvidenceDownload(incidentId, evidenceId) {
    const [rows] = await pool.execute(
        `SELECT ic.usuario_id, e.nombre_original, e.nombre_archivo, e.tipo_mime
         FROM incidencias_cuentas ic
         INNER JOIN incidencia_cuenta_evidencias e ON e.incidencia_id = ic.id
         WHERE ic.id = ? AND e.id = ?`,
        [incidentId, evidenceId]
    );
    return rows[0] || null;
}

async function escalateIncident(id, userId, reason) {
    return inTransaction(async connection => {
        const [rows] = await connection.execute(
            'SELECT id, ticket_id, estado FROM incidencias_cuentas WHERE id = ? FOR UPDATE',
            [id]
        );
        if (!rows.length) {
            const err = new Error('No se encontró la incidencia');
            err.status = 404;
            throw err;
        }
        const incidence = rows[0];
        if (incidence.estado === 'RESUELTO' || incidence.estado === 'ESCALADO_ABANCAY') {
            const err = new Error('La incidencia ya fue resuelta o escalada');
            err.status = 409;
            throw err;
        }
        await connection.execute(
            `INSERT INTO escalamientos
                (incidencia_id, origen, destino, motivo, usuario_escalo, estado)
             VALUES (?, 'Andahuaylas', 'Abancay', ?, ?, 'PENDIENTE')`,
            [id, reason, userId]
        );
        await connection.execute(
            "UPDATE incidencias_cuentas SET estado = 'ESCALADO_ABANCAY' WHERE id = ?",
            [id]
        );
        await writeHistory(
            connection,
            incidence,
            userId,
            'ESCALAMIENTO',
            incidence.estado,
            'ESCALADO_ABANCAY',
            reason
        );
        return { mensaje: 'Incidencia escalada a Abancay', estado: 'ESCALADO_ABANCAY' };
    });
}

async function resolveIncident(id, userId, solution) {
    return inTransaction(async connection => {
        const [rows] = await connection.execute(
            'SELECT id, ticket_id, estado FROM incidencias_cuentas WHERE id = ? FOR UPDATE',
            [id]
        );
        if (!rows.length) {
            const err = new Error('No se encontró la incidencia');
            err.status = 404;
            throw err;
        }
        const incidence = rows[0];
        if (incidence.estado === 'RESUELTO') {
            const err = new Error('La incidencia ya está resuelta');
            err.status = 409;
            throw err;
        }
        await connection.execute(
            `UPDATE incidencias_cuentas
             SET solucion = ?, estado = 'RESUELTO', fecha_resolucion = CURRENT_TIMESTAMP,
                 usuario_resolvio = ?
             WHERE id = ?`,
            [solution, userId, id]
        );
        await connection.execute(
            `UPDATE escalamientos SET estado = 'RESUELTO', fecha_resolucion = CURRENT_TIMESTAMP
             WHERE incidencia_id = ? AND estado = 'PENDIENTE'`,
            [id]
        );
        await writeHistory(connection, incidence, userId, 'RESOLUCION', incidence.estado, 'RESUELTO', solution);
        return { mensaje: 'Solución registrada correctamente', estado: 'RESUELTO' };
    });
}

async function addEvidence({ id, userId, type, file }) {
    const [incidents] = await pool.execute(
        'SELECT id, usuario_id FROM incidencias_cuentas WHERE id = ?',
        [id]
    );
    if (!incidents.length) {
        const err = new Error('No se encontró la incidencia');
        err.status = 404;
        throw err;
    }
    const [result] = await pool.execute(
        `INSERT INTO incidencia_cuenta_evidencias
            (incidencia_id, usuario_id, tipo, nombre_original, nombre_archivo, tipo_mime, tamano_bytes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            id,
            userId,
            type,
            path.basename(file.originalname).slice(0, 255),
            file.filename,
            file.mimetype,
            file.size
        ]
    );
    return { id: result.insertId, tipo: type };
}

async function getStats() {
    const [totals] = await pool.query(
        `SELECT COUNT(*) AS total,
                COALESCE(SUM(ic.estado = 'RESUELTO' AND NOT EXISTS (
                    SELECT 1 FROM escalamientos e WHERE e.incidencia_id = ic.id
                )), 0) AS resueltos_localmente,
                COALESCE(SUM(EXISTS (
                    SELECT 1 FROM escalamientos e
                    WHERE e.incidencia_id = ic.id AND e.destino = 'Abancay'
                )), 0) AS escalados_abancay,
                AVG(CASE WHEN ic.fecha_resolucion IS NOT NULL
                    THEN TIMESTAMPDIFF(MINUTE, ic.fecha_creacion, ic.fecha_resolucion)
                    ELSE NULL END) AS tiempo_promedio
         FROM incidencias_cuentas ic`
    );
    const [platforms] = await pool.query(
        `SELECT p.id, p.nombre AS plataforma, COUNT(ic.id) AS total
         FROM plataformas p
         LEFT JOIN incidencias_cuentas ic ON ic.plataforma_id = p.id
         GROUP BY p.id, p.nombre
         ORDER BY total DESC, p.nombre
         LIMIT 5`
    );
    const row = totals[0];
    const total = Number(row.total);
    return {
        total,
        resueltos_localmente_pct: total ? Number((Number(row.resueltos_localmente) * 100 / total).toFixed(2)) : null,
        escalados_abancay_pct: total ? Number((Number(row.escalados_abancay) * 100 / total).toFixed(2)) : null,
        tiempo_promedio: row.tiempo_promedio === null ? null : Number(Number(row.tiempo_promedio).toFixed(2)),
        plataformas_mas_afectadas: platforms
    };
}

module.exports = {
    getPlatforms,
    getFaculties,
    createPlatform,
    createIncident,
    listIncidents,
    getIncident,
    getEvidenceDownload,
    escalateIncident,
    resolveIncident,
    addEvidence,
    getStats,
    close: () => pool.end()
};
