const db = require('../db');
const path = require('path');
const fs = require('fs');
const {
    validarSolicitudApoyo,
    TRANSICIONES_APOYO_PERMITIDAS,
    horaAMinutos,
    normalizarHora
} = require('../utils/apoyosValidation');
const { detectarConflictos } = require('./apoyosConflictService');
const { programarRecordatorios } = require('./apoyosRemindersService');

// Directorio seguro de almacenamiento de autorizaciones
function getUploadDir() {
    const uploadRoot = process.env.UTEA_UPLOAD_ROOT || path.join(__dirname, '..', 'uploads');
    const dir = path.join(uploadRoot, 'autorizaciones');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}

/**
 * Resuelve el registro de técnico para un usuario autenticado
 */
async function resolverTecnicoParaUsuario(usuario, conn) {
    if (!usuario) return null;

    let fullName = usuario.nombre_completo;
    if (!fullName && usuario.id) {
        const [u] = await conn.query('SELECT nombre_completo FROM usuarios WHERE id = ?', [usuario.id]);
        if (u.length > 0 && u[0].nombre_completo) fullName = u[0].nombre_completo;
    }

    const [rows] = await conn.query(`
        SELECT id, nombre, es_jefe 
        FROM tecnicos 
        WHERE LOWER(TRIM(nombre)) = LOWER(TRIM(?)) OR LOWER(TRIM(nombre)) = LOWER(TRIM(?))
        ORDER BY id DESC
        LIMIT 1
    `, [fullName || '', usuario.username || '']);
    if (rows.length > 0) return rows[0];

    // Si el usuario tiene rol tecnico y solo hay un tecnico o coincide
    if (usuario.rol === 'tecnico') {
        const [anyTech] = await conn.query('SELECT id, nombre, es_jefe FROM tecnicos ORDER BY id DESC LIMIT 1');
        return anyTech[0] || null;
    }
    return null;
}

/**
 * Comprueba si un usuario puede operar como técnico asignado de un apoyo
 */
async function esTecnicoAsignado(usuario, apoyo, conn) {
    if (!usuario || !apoyo || !apoyo.tecnico_id) return false;
    if (['admin', 'superadmin'].includes(usuario.rol)) return true;

    const tech = await resolverTecnicoParaUsuario(usuario, conn);
    if (tech && Number(tech.id) === Number(apoyo.tecnico_id)) return true;

    // Verificar si hay mapeo directo por username o email
    const [match] = await conn.query(`
        SELECT t.id FROM tecnicos t
        INNER JOIN usuarios u ON (u.username = t.nombre OR u.nombre_completo = t.nombre)
        WHERE t.id = ? AND u.id = ?
    `, [apoyo.tecnico_id, usuario.id]);

    if (match.length > 0) return true;

    if (usuario.rol === 'tecnico') return true;

    return false;
}

/**
 * Registra un hito en el historial del apoyo
 */
async function registrarHistorial(conn, apoyoId, usuarioId, accion, estadoAnterior, estadoNuevo, detalles = null) {
    await conn.query(`
        INSERT INTO apoyo_historial (apoyo_id, usuario_id, accion, estado_anterior, estado_nuevo, detalles)
        VALUES (?, ?, ?, ?, ?, ?)
    `, [apoyoId, usuarioId, accion, estadoAnterior, estadoNuevo, detalles]);
}

/**
 * Genera código único institucional para la solicitud de apoyo
 */
async function generarCodigoApoyo(conn) {
    const anio = new Date().getFullYear();
    const [result] = await conn.query(`
        SELECT id FROM solicitudes_apoyo ORDER BY id DESC LIMIT 1
    `);
    const nextNum = (result[0]?.id || 0) + 1;
    return `APOYO-${anio}-${String(nextNum).padStart(4, '0')}`;
}

/**
 * Crea una nueva solicitud de apoyo
 */
async function crearSolicitud(usuario, body, file) {
    const conn = db.promise();
    const validation = validarSolicitudApoyo(body, file);
    if (validation.error) {
        if (file && file.path && fs.existsSync(file.path)) {
            try { fs.unlinkSync(file.path); } catch (_) {}
        }
        return { status: 400, error: validation.error };
    }

    const d = validation.data;
    const codigo = await generarCodigoApoyo(conn);

    const [res] = await conn.query(`
        INSERT INTO solicitudes_apoyo (
            codigo, user_id, solicitante_contacto, area_organizadora, responsable_evento,
            nombre_actividad, descripcion, bloque, ambiente, fecha_evento,
            hora_inicio, hora_fin, hora_preparacion, apoyos_requeridos,
            equipos_recursos, observaciones,
            archivo_autorizacion, archivo_autorizacion_nombre, archivo_autorizacion_mime, archivo_autorizacion_size,
            estado
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Recibida')
    `, [
        codigo, usuario.id, d.solicitante_contacto, d.area_organizadora, d.responsable_evento,
        d.nombre_actividad, d.descripcion, d.bloque, d.ambiente, d.fecha_evento,
        d.hora_inicio, d.hora_fin, d.hora_preparacion, d.apoyos_requeridos,
        d.equipos_recursos, d.observaciones,
        file.filename, file.originalname, file.mimetype, file.size
    ]);

    const apoyoId = res.insertId;

    await registrarHistorial(conn, apoyoId, usuario.id, 'creacion', null, 'Recibida', 'Solicitud ingresada por el usuario');

    // Notificar a administradores
    const [admins] = await conn.query(`SELECT id FROM usuarios WHERE rol IN ('admin', 'superadmin')`);
    for (const adm of admins) {
        await conn.query(`
            INSERT INTO notificaciones (user_id, tipo, mensaje, apoyo_id, referencia_tipo)
            VALUES (?, 'nueva_solicitud_apoyo', ?, ?, 'apoyo')
        `, [adm.id, `Nueva solicitud de apoyo para evento "${d.nombre_actividad}" (${codigo}) recibida.`, apoyoId]);
    }

    return {
        status: 201,
        solicitud: {
            id: apoyoId,
            codigo,
            estado: 'Recibida',
            nombre_actividad: d.nombre_actividad,
            fecha_evento: d.fecha_evento,
            hora_inicio: d.hora_inicio,
            hora_fin: d.hora_fin
        }
    };
}

/**
 * Lista solicitudes con filtros y control de acceso
 */
async function listarSolicitudes(usuario, query = {}) {
    const conn = db.promise();
    const conditions = [];
    const params = [];

    const esAdmin = ['admin', 'superadmin'].includes(usuario.rol);
    const techRecord = await resolverTecnicoParaUsuario(usuario, conn);

    if (query.vista === 'mis_solicitudes' || (!esAdmin && usuario.rol !== 'tecnico')) {
        // Solicitante ve exclusivamente las suyas
        conditions.push('a.user_id = ?');
        params.push(usuario.id);
    } else if (usuario.rol === 'tecnico' && !esAdmin) {
        // Técnico ve las asignadas a él (por coincidencia de nombre, id o si él mismo fue el solicitante)
        let fullName = usuario.nombre_completo;
        if (!fullName && usuario.id) {
            const [u] = await conn.query('SELECT nombre_completo FROM usuarios WHERE id = ?', [usuario.id]);
            if (u.length > 0 && u[0].nombre_completo) fullName = u[0].nombre_completo;
        }

        const [techIds] = await conn.query(`
            SELECT id FROM tecnicos 
            WHERE LOWER(TRIM(nombre)) = LOWER(TRIM(?)) OR LOWER(TRIM(nombre)) = LOWER(TRIM(?))
        `, [fullName || '', usuario.username || '']);

        const ids = techIds.map(t => t.id);
        if (techRecord && !ids.includes(techRecord.id)) ids.push(techRecord.id);

        if (ids.length > 0) {
            conditions.push(`(a.tecnico_id IN (${ids.map(() => '?').join(',')}) OR a.user_id = ?)`);
            params.push(...ids, usuario.id);
        } else {
            conditions.push('a.user_id = ?');
            params.push(usuario.id);
        }
    } else if (query.tecnico_id) {
        conditions.push('a.tecnico_id = ?');
        params.push(Number(query.tecnico_id));
    }

    if (query.estado) {
        conditions.push('a.estado = ?');
        params.push(query.estado);
    }

    if (query.fecha_desde) {
        conditions.push('a.fecha_evento >= ?');
        params.push(query.fecha_desde);
    }

    if (query.fecha_hasta) {
        conditions.push('a.fecha_evento <= ?');
        params.push(query.fecha_hasta);
    }

    if (query.bloque) {
        conditions.push('a.bloque = ?');
        params.push(query.bloque);
    }

    if (query.ambiente) {
        conditions.push('a.ambiente = ?');
        params.push(query.ambiente);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
        SELECT 
            a.*,
            t.nombre AS tecnico_nombre,
            u.username AS solicitante_username,
            u.nombre_completo AS solicitante_nombre_completo,
            CASE 
                WHEN a.estado = 'Programada' AND a.llegada_registrada_at IS NULL AND TIMESTAMP(a.fecha_evento, a.hora_inicio) < NOW() THEN 1
                ELSE 0
            END AS atencion_no_registrada
        FROM solicitudes_apoyo a
        LEFT JOIN tecnicos t ON t.id = a.tecnico_id
        LEFT JOIN usuarios u ON u.id = a.user_id
        ${whereClause}
        ORDER BY a.fecha_evento DESC, a.hora_inicio DESC
    `;

    const [rows] = await conn.query(sql, params);

    // Parsear JSON apoyos_requeridos
    const data = rows.map(r => {
        let apoyos = [];
        try {
            apoyos = typeof r.apoyos_requeridos === 'string' ? JSON.parse(r.apoyos_requeridos) : r.apoyos_requeridos;
        } catch (_) {}
        return {
            ...r,
            apoyos_requeridos: apoyos,
            atencion_no_registrada: Boolean(r.atencion_no_registrada)
        };
    });

    return data;
}

/**
 * Obtiene el detalle completo de un apoyo con su historial
 */
async function obtenerSolicitudPorId(id, usuario) {
    const conn = db.promise();
    const [rows] = await conn.query(`
        SELECT 
            a.*,
            t.nombre AS tecnico_nombre,
            u.username AS solicitante_username,
            u.nombre_completo AS solicitante_nombre_completo,
            CASE 
                WHEN a.estado = 'Programada' AND a.llegada_registrada_at IS NULL AND TIMESTAMP(a.fecha_evento, a.hora_inicio) < NOW() THEN 1
                ELSE 0
            END AS atencion_no_registrada
        FROM solicitudes_apoyo a
        LEFT JOIN tecnicos t ON t.id = a.tecnico_id
        LEFT JOIN usuarios u ON u.id = a.user_id
        WHERE a.id = ?
    `, [id]);

    if (!rows.length) return null;
    const apoyo = rows[0];

    // Validación de permisos de acceso
    const esAdmin = ['admin', 'superadmin'].includes(usuario.rol);
    const esCreador = Number(apoyo.user_id) === Number(usuario.id);
    const esTech = await esTecnicoAsignado(usuario, apoyo, conn);

    if (!esAdmin && !esCreador && !esTech) {
        const error = new Error('No tienes permiso para ver los detalles de esta solicitud de apoyo');
        error.statusCode = 403;
        throw error;
    }

    let apoyos = [];
    try {
        apoyos = typeof apoyo.apoyos_requeridos === 'string' ? JSON.parse(apoyo.apoyos_requeridos) : apoyo.apoyos_requeridos;
    } catch (_) {}

    const [historial] = await conn.query(`
        SELECT h.*, u.username, u.nombre_completo
        FROM apoyo_historial h
        INNER JOIN usuarios u ON u.id = h.usuario_id
        WHERE h.apoyo_id = ?
        ORDER BY h.creado_en DESC
    `, [id]);

    const [recordatorios] = await conn.query(`
        SELECT r.*, u.username
        FROM apoyo_recordatorios r
        INNER JOIN usuarios u ON u.id = r.usuario_id
        WHERE r.apoyo_id = ?
        ORDER BY r.fecha_programada_aviso ASC
    `, [id]);

    return {
        ...apoyo,
        apoyos_requeridos: apoyos,
        atencion_no_registrada: Boolean(apoyo.atencion_no_registrada),
        historial,
        recordatorios
    };
}

/**
 * El administrador observa la solicitud requiriendo subsanación
 */
async function observarSolicitud(id, usuario, motivo) {
    const conn = db.promise();
    if (!['admin', 'superadmin'].includes(usuario.rol)) {
        return { status: 403, error: 'Solo los administradores pueden observar solicitudes' };
    }
    if (!motivo || typeof motivo !== 'string' || motivo.trim().length < 5) {
        return { status: 400, error: 'El motivo de observación debe contener al menos 5 caracteres' };
    }

    const [rows] = await conn.query('SELECT id, user_id, estado, nombre_actividad, codigo FROM solicitudes_apoyo WHERE id = ?', [id]);
    if (!rows.length) return { status: 404, error: 'Solicitud no encontrada' };
    const apoyo = rows[0];

    if (!TRANSICIONES_APOYO_PERMITIDAS[apoyo.estado]?.has('Observada')) {
        return { status: 400, error: `No se puede observar una solicitud en estado "${apoyo.estado}"` };
    }

    await conn.query(`
        UPDATE solicitudes_apoyo 
        SET estado = 'Observada', motivo_observacion = ? 
        WHERE id = ?
    `, [motivo.trim(), id]);

    await registrarHistorial(conn, id, usuario.id, 'observacion', apoyo.estado, 'Observada', motivo.trim());

    // Notificar al solicitante
    await conn.query(`
        INSERT INTO notificaciones (user_id, tipo, mensaje, apoyo_id, referencia_tipo)
        VALUES (?, 'apoyo_observado', ?, ?, 'apoyo')
    `, [apoyo.user_id, `Tu solicitud "${apoyo.nombre_actividad}" (${apoyo.codigo}) ha sido observada: ${motivo.trim()}`, id]);

    return { status: 200, mensaje: 'Solicitud observada exitosamente' };
}

/**
 * El solicitante subsana la solicitud observada
 */
async function subsanarSolicitud(id, usuario, subsanacionTexto, nuevoArchivo = null) {
    const conn = db.promise();
    const [rows] = await conn.query('SELECT id, user_id, estado, nombre_actividad, codigo FROM solicitudes_apoyo WHERE id = ?', [id]);
    if (!rows.length) return { status: 404, error: 'Solicitud no encontrada' };
    const apoyo = rows[0];

    // Permisos: solo el creador puede subsanar
    if (Number(apoyo.user_id) !== Number(usuario.id)) {
        return { status: 403, error: 'Solo el solicitante original puede subsanar esta solicitud' };
    }

    if (apoyo.estado !== 'Observada') {
        return { status: 400, error: 'Solo se pueden subsanar solicitudes en estado "Observada"' };
    }

    if (!subsanacionTexto || typeof subsanacionTexto !== 'string' || subsanacionTexto.trim().length < 5) {
        return { status: 400, error: 'El detalle de subsanación debe tener al menos 5 caracteres' };
    }

    let fileSql = '';
    const fileParams = [];
    if (nuevoArchivo) {
        fileSql = ', archivo_autorizacion = ?, archivo_autorizacion_nombre = ?, archivo_autorizacion_mime = ?, archivo_autorizacion_size = ?';
        fileParams.push(nuevoArchivo.filename, nuevoArchivo.originalname, nuevoArchivo.mimetype, nuevoArchivo.size);
    }

    await conn.query(`
        UPDATE solicitudes_apoyo 
        SET estado = 'En revision', subsanacion_solicitante = ? ${fileSql}
        WHERE id = ?
    `, [subsanacionTexto.trim(), ...fileParams, id]);

    await registrarHistorial(conn, id, usuario.id, 'subsanacion', 'Observada', 'En revision', subsanacionTexto.trim());

    // Notificar a administradores
    const [admins] = await conn.query(`SELECT id FROM usuarios WHERE rol IN ('admin', 'superadmin')`);
    for (const adm of admins) {
        await conn.query(`
            INSERT INTO notificaciones (user_id, tipo, mensaje, apoyo_id, referencia_tipo)
            VALUES (?, 'apoyo_subsanado', ?, ?, 'apoyo')
        `, [adm.id, `La solicitud "${apoyo.nombre_actividad}" (${apoyo.codigo}) ha sido subsanada y requiere revisión.`, id]);
    }

    return { status: 200, mensaje: 'Solicitud subsanada exitosamente, ha pasado a "En revision"' };
}

/**
 * Aprueba una solicitud de apoyo
 */
async function aprobarSolicitud(id, usuario) {
    const conn = db.promise();
    if (!['admin', 'superadmin'].includes(usuario.rol)) {
        return { status: 403, error: 'Solo los administradores pueden aprobar solicitudes' };
    }

    const [rows] = await conn.query('SELECT * FROM solicitudes_apoyo WHERE id = ?', [id]);
    if (!rows.length) return { status: 404, error: 'Solicitud no encontrada' };
    const apoyo = rows[0];

    if (!TRANSICIONES_APOYO_PERMITIDAS[apoyo.estado]?.has('Aprobada')) {
        return { status: 400, error: `No se puede aprobar una solicitud en estado "${apoyo.estado}"` };
    }

    // Comprobar conflictos de horario
    const conflicto = await detectarConflictos({
        apoyoId: id,
        fecha_evento: apoyo.fecha_evento,
        hora_preparacion: apoyo.hora_preparacion,
        hora_fin: apoyo.hora_fin,
        bloque: apoyo.bloque,
        ambiente: apoyo.ambiente,
        tecnico_id: apoyo.tecnico_id
    });

    if (conflicto.hasConflict) {
        return {
            status: 409,
            error: 'No se puede aprobar debido a conflictos de horario detectados',
            conflictos: conflicto.conflicts
        };
    }

    await conn.query(`UPDATE solicitudes_apoyo SET estado = 'Aprobada' WHERE id = ?`, [id]);
    await registrarHistorial(conn, id, usuario.id, 'aprobacion', apoyo.estado, 'Aprobada', 'Aprobado por administración');

    // Notificar solicitante
    await conn.query(`
        INSERT INTO notificaciones (user_id, tipo, mensaje, apoyo_id, referencia_tipo)
        VALUES (?, 'apoyo_aprobado', ?, ?, 'apoyo')
    `, [apoyo.user_id, `Tu solicitud de apoyo para "${apoyo.nombre_actividad}" (${apoyo.codigo}) ha sido APROBADA.`, id]);

    return { status: 200, mensaje: 'Solicitud aprobada exitosamente' };
}

/**
 * Rechaza una solicitud de apoyo
 */
async function rechazarSolicitud(id, usuario, motivo) {
    const conn = db.promise();
    if (!['admin', 'superadmin'].includes(usuario.rol)) {
        return { status: 403, error: 'Solo los administradores pueden rechazar solicitudes' };
    }
    if (!motivo || typeof motivo !== 'string' || motivo.trim().length < 5) {
        return { status: 400, error: 'El motivo de rechazo debe contener al menos 5 caracteres' };
    }

    const [rows] = await conn.query('SELECT * FROM solicitudes_apoyo WHERE id = ?', [id]);
    if (!rows.length) return { status: 404, error: 'Solicitud no encontrada' };
    const apoyo = rows[0];

    if (!TRANSICIONES_APOYO_PERMITIDAS[apoyo.estado]?.has('Rechazada')) {
        return { status: 400, error: `No se puede rechazar una solicitud en estado "${apoyo.estado}"` };
    }

    await conn.query(`
        UPDATE solicitudes_apoyo 
        SET estado = 'Rechazada', motivo_rechazo = ? 
        WHERE id = ?
    `, [motivo.trim(), id]);

    await conn.query(`
        UPDATE apoyo_recordatorios SET estado = 'cancelado' WHERE apoyo_id = ? AND estado = 'pendiente'
    `, [id]);

    await registrarHistorial(conn, id, usuario.id, 'rechazo', apoyo.estado, 'Rechazada', motivo.trim());

    // Notificar solicitante
    await conn.query(`
        INSERT INTO notificaciones (user_id, tipo, mensaje, apoyo_id, referencia_tipo)
        VALUES (?, 'apoyo_rechazado', ?, ?, 'apoyo')
    `, [apoyo.user_id, `Tu solicitud de apoyo para "${apoyo.nombre_actividad}" (${apoyo.codigo}) fue rechazada: ${motivo.trim()}`, id]);

    return { status: 200, mensaje: 'Solicitud rechazada exitosamente' };
}

/**
 * Programa o reprograma una solicitud de apoyo (asigna técnico y horario definitivo)
 */
async function programarSolicitud(id, usuario, { fecha_evento, hora_inicio, hora_fin, hora_preparacion, tecnico_id }) {
    const conn = db.promise();
    if (!['admin', 'superadmin'].includes(usuario.rol)) {
        return { status: 403, error: 'Solo los administradores pueden programar o reprogramar apoyos' };
    }

    const [rows] = await conn.query('SELECT * FROM solicitudes_apoyo WHERE id = ?', [id]);
    if (!rows.length) return { status: 404, error: 'Solicitud no encontrada' };
    const apoyo = rows[0];

    if (!TRANSICIONES_APOYO_PERMITIDAS[apoyo.estado]?.has('Programada')) {
        return { status: 400, error: `No se puede programar una solicitud en estado "${apoyo.estado}"` };
    }

    const fechaFinal = fecha_evento || (typeof apoyo.fecha_evento === 'string' ? apoyo.fecha_evento.slice(0, 10) : new Date(apoyo.fecha_evento).toISOString().slice(0, 10));
    const horaPrepFinal = hora_preparacion ? normalizarHora(hora_preparacion) : apoyo.hora_preparacion;
    const horaInicioFinal = hora_inicio ? normalizarHora(hora_inicio) : apoyo.hora_inicio;
    const horaFinFinal = hora_fin ? normalizarHora(hora_fin) : apoyo.hora_fin;
    const techIdFinal = tecnico_id !== undefined ? (tecnico_id ? Number(tecnico_id) : null) : apoyo.tecnico_id;

    if (!techIdFinal) {
        return { status: 400, error: 'Debe asignar un técnico responsable para programar el apoyo' };
    }

    // Validar orden de horas
    const minPrep = horaAMinutos(horaPrepFinal);
    const minInicio = horaAMinutos(horaInicioFinal);
    const minFin = horaAMinutos(horaFinFinal);

    if (minPrep >= minInicio) {
        return { status: 400, error: 'La hora de preparación debe ser anterior a la hora de inicio' };
    }
    if (minInicio >= minFin) {
        return { status: 400, error: 'La hora de inicio debe ser anterior a la hora de finalización' };
    }

    // Validar técnico existe
    const [techRows] = await conn.query('SELECT id, nombre FROM tecnicos WHERE id = ?', [techIdFinal]);
    if (!techRows.length) {
        return { status: 400, error: 'El técnico especificado no existe' };
    }

    // Validar cruces de horario
    const conflicto = await detectarConflictos({
        apoyoId: id,
        fecha_evento: fechaFinal,
        hora_preparacion: horaPrepFinal,
        hora_fin: horaFinFinal,
        bloque: apoyo.bloque,
        ambiente: apoyo.ambiente,
        tecnico_id: techIdFinal
    });

    if (conflicto.hasConflict) {
        return {
            status: 409,
            error: 'Se detectaron cruces de horario que impiden la programación',
            conflictos: conflicto.conflicts
        };
    }

    await conn.query(`
        UPDATE solicitudes_apoyo
        SET estado = 'Programada',
            fecha_evento = ?,
            hora_preparacion = ?,
            hora_inicio = ?,
            hora_fin = ?,
            tecnico_id = ?,
            recepcion_confirmada = FALSE,
            fecha_recepcion_confirmada = NULL
        WHERE id = ?
    `, [fechaFinal, horaPrepFinal, horaInicioFinal, horaFinFinal, techIdFinal, id]);

    // Programar recordatorios persistentes
    await programarRecordatorios(id, conn);

    await registrarHistorial(
        conn, id, usuario.id, 'programacion', apoyo.estado, 'Programada',
        `Programado para ${fechaFinal} de ${horaPrepFinal.slice(0, 5)} a ${horaFinFinal.slice(0, 5)} con técnico ${techRows[0].nombre}`
    );

    // Notificar al solicitante
    await conn.query(`
        INSERT INTO notificaciones (user_id, tipo, mensaje, apoyo_id, referencia_tipo)
        VALUES (?, 'apoyo_programado', ?, ?, 'apoyo')
    `, [apoyo.user_id, `Tu apoyo técnico para "${apoyo.nombre_actividad}" (${apoyo.codigo}) ha sido PROGRAMADO para el ${fechaFinal} a las ${horaInicioFinal.slice(0, 5)}.`, id]);

    // Notificar al técnico
    const [techUser] = await conn.query(`
        SELECT u.id FROM tecnicos t
        INNER JOIN usuarios u ON (u.username = t.nombre OR u.nombre_completo = t.nombre OR u.rol = 'tecnico')
        WHERE t.id = ?
        LIMIT 1
    `, [techIdFinal]);

    if (techUser.length > 0) {
        await conn.query(`
            INSERT INTO notificaciones (user_id, tipo, mensaje, apoyo_id, referencia_tipo)
            VALUES (?, 'apoyo_asignado_tecnico', ?, ?, 'apoyo')
        `, [techUser[0].id, `Se te ha asignado el apoyo técnico para "${apoyo.nombre_actividad}" (${apoyo.codigo}) en ${apoyo.ambiente} (${fechaFinal} ${horaPrepFinal.slice(0, 5)}).`, id]);
    }

    return { status: 200, mensaje: 'Apoyo programado exitosamente con recordatorios configurados' };
}

/**
 * Cancela una solicitud de apoyo (por el solicitante o admin)
 */
async function cancelarSolicitud(id, usuario, motivo) {
    const conn = db.promise();
    const [rows] = await conn.query('SELECT * FROM solicitudes_apoyo WHERE id = ?', [id]);
    if (!rows.length) return { status: 404, error: 'Solicitud no encontrada' };
    const apoyo = rows[0];

    const esAdmin = ['admin', 'superadmin'].includes(usuario.rol);
    const esCreador = Number(apoyo.user_id) === Number(usuario.id);

    if (!esAdmin && !esCreador) {
        return { status: 403, error: 'No tienes permisos para cancelar esta solicitud' };
    }

    if (!TRANSICIONES_APOYO_PERMITIDAS[apoyo.estado]?.has('Cancelada')) {
        return { status: 400, error: `No se puede cancelar una solicitud en estado "${apoyo.estado}"` };
    }

    const motivoFinal = motivo ? String(motivo).trim() : 'Cancelado por el usuario';

    await conn.query(`
        UPDATE solicitudes_apoyo 
        SET estado = 'Cancelada', motivo_cancelacion = ? 
        WHERE id = ?
    `, [motivoFinal, id]);

    await conn.query(`
        UPDATE apoyo_recordatorios SET estado = 'cancelado' WHERE apoyo_id = ? AND estado = 'pendiente'
    `, [id]);

    await registrarHistorial(conn, id, usuario.id, 'cancelacion', apoyo.estado, 'Cancelada', motivoFinal);

    return { status: 200, mensaje: 'Solicitud cancelada exitosamente' };
}

/**
 * Técnico confirma recepción de la tarea
 */
async function confirmarRecepcion(id, usuario) {
    const conn = db.promise();
    const [rows] = await conn.query('SELECT * FROM solicitudes_apoyo WHERE id = ?', [id]);
    if (!rows.length) return { status: 404, error: 'Solicitud no encontrada' };
    const apoyo = rows[0];

    const esTech = await esTecnicoAsignado(usuario, apoyo, conn);
    if (!esTech) {
        return { status: 403, error: 'Solo el técnico asignado o un administrador pueden confirmar la recepción' };
    }

    if (apoyo.estado !== 'Programada') {
        return { status: 400, error: 'Solo se puede confirmar recepción en solicitudes con estado "Programada"' };
    }

    await conn.query(`
        UPDATE solicitudes_apoyo
        SET recepcion_confirmada = TRUE, fecha_recepcion_confirmada = NOW()
        WHERE id = ?
    `, [id]);

    await registrarHistorial(conn, id, usuario.id, 'confirmacion_recepcion', 'Programada', 'Programada', 'Recepción de tarea confirmada por técnico');

    return { status: 200, mensaje: 'Recepción confirmada exitosamente' };
}

/**
 * Técnico registra llegada e inicia el apoyo
 */
async function registrarLlegada(id, usuario) {
    const conn = db.promise();
    const [rows] = await conn.query('SELECT * FROM solicitudes_apoyo WHERE id = ?', [id]);
    if (!rows.length) return { status: 404, error: 'Solicitud no encontrada' };
    const apoyo = rows[0];

    const esTech = await esTecnicoAsignado(usuario, apoyo, conn);
    if (!esTech) {
        return { status: 403, error: 'Solo el técnico asignado o un administrador pueden registrar llegada e inicio' };
    }

    if (apoyo.estado !== 'Programada') {
        return { status: 400, error: 'Solo se puede registrar llegada en solicitudes con estado "Programada"' };
    }

    await conn.query(`
        UPDATE solicitudes_apoyo
        SET estado = 'En atencion',
            llegada_registrada_at = NOW(),
            llegada_usuario_id = ?
        WHERE id = ?
    `, [usuario.id, id]);

    await registrarHistorial(conn, id, usuario.id, 'llegada_inicio', 'Programada', 'En atencion', 'Llegada y comienzo de preparación registrados');

    // Notificar solicitante
    await conn.query(`
        INSERT INTO notificaciones (user_id, tipo, mensaje, apoyo_id, referencia_tipo)
        VALUES (?, 'apoyo_en_atencion', ?, ?, 'apoyo')
    `, [apoyo.user_id, `El personal técnico ha llegado al ambiente para el evento "${apoyo.nombre_actividad}" (${apoyo.codigo}).`, id]);

    return { status: 200, mensaje: 'Llegada e inicio de atención registrados exitosamente' };
}

/**
 * Técnico finaliza el apoyo técnico
 */
async function finalizarApoyo(id, usuario, { trabajo_realizado, observaciones_cierre }, file = null) {
    const conn = db.promise();
    const [rows] = await conn.query('SELECT * FROM solicitudes_apoyo WHERE id = ?', [id]);
    if (!rows.length) return { status: 404, error: 'Solicitud no encontrada' };
    const apoyo = rows[0];

    const esTech = await esTecnicoAsignado(usuario, apoyo, conn);
    if (!esTech) {
        return { status: 403, error: 'Solo el técnico asignado o un administrador pueden finalizar el apoyo' };
    }

    if (apoyo.estado !== 'En atencion') {
        return { status: 400, error: 'Solo se pueden finalizar apoyos que estén "En atencion"' };
    }

    if (!trabajo_realizado || typeof trabajo_realizado !== 'string' || trabajo_realizado.trim().length < 5) {
        return { status: 400, error: 'El registro del trabajo realizado es obligatorio (mínimo 5 caracteres)' };
    }

    const archivoEvidencia = file ? file.filename : null;

    await conn.query(`
        UPDATE solicitudes_apoyo
        SET estado = 'Finalizada',
            finalizacion_at = NOW(),
            trabajo_realizado = ?,
            observaciones_cierre = ?,
            archivo_evidencia_cierre = ?
        WHERE id = ?
    `, [trabajo_realizado.trim(), observaciones_cierre ? observaciones_cierre.trim() : null, archivoEvidencia, id]);

    await registrarHistorial(conn, id, usuario.id, 'finalizacion', 'En atencion', 'Finalizada', trabajo_realizado.trim());

    // Notificar solicitante
    await conn.query(`
        INSERT INTO notificaciones (user_id, tipo, mensaje, apoyo_id, referencia_tipo)
        VALUES (?, 'apoyo_finalizado', ?, ?, 'apoyo')
    `, [apoyo.user_id, `El apoyo técnico para "${apoyo.nombre_actividad}" (${apoyo.codigo}) ha sido finalizado con éxito.`, id]);

    return { status: 200, mensaje: 'Servicio de apoyo técnico finalizado exitosamente' };
}

/**
 * Técnico informa impedimento
 */
async function informarImpedimento(id, usuario, motivo) {
    const conn = db.promise();
    const [rows] = await conn.query('SELECT * FROM solicitudes_apoyo WHERE id = ?', [id]);
    if (!rows.length) return { status: 404, error: 'Solicitud no encontrada' };
    const apoyo = rows[0];

    const esTech = await esTecnicoAsignado(usuario, apoyo, conn);
    if (!esTech) {
        return { status: 403, error: 'Solo el técnico asignado o un administrador pueden informar impedimento' };
    }

    if (!['Programada', 'En atencion'].includes(apoyo.estado)) {
        return { status: 400, error: 'Solo se puede informar impedimento en solicitudes "Programada" o "En atencion"' };
    }

    if (!motivo || typeof motivo !== 'string' || motivo.trim().length < 5) {
        return { status: 400, error: 'El motivo del impedimento debe contener al menos 5 caracteres' };
    }

    await conn.query(`
        UPDATE solicitudes_apoyo
        SET estado = 'Impedida',
            impedimento_at = NOW(),
            motivo_impedimento = ?
        WHERE id = ?
    `, [motivo.trim(), id]);

    await conn.query(`
        UPDATE apoyo_recordatorios SET estado = 'cancelado' WHERE apoyo_id = ? AND estado = 'pendiente'
    `, [id]);

    await registrarHistorial(conn, id, usuario.id, 'impedimento', apoyo.estado, 'Impedida', motivo.trim());

    // Notificar administradores y solicitante
    const [admins] = await conn.query(`SELECT id FROM usuarios WHERE rol IN ('admin', 'superadmin')`);
    for (const adm of admins) {
        await conn.query(`
            INSERT INTO notificaciones (user_id, tipo, mensaje, apoyo_id, referencia_tipo)
            VALUES (?, 'apoyo_impedido', ?, ?, 'apoyo')
        `, [adm.id, `ALERTA: Se ha informado impedimento en el apoyo para "${apoyo.nombre_actividad}" (${apoyo.codigo}): ${motivo.trim()}`, id]);
    }

    await conn.query(`
        INSERT INTO notificaciones (user_id, tipo, mensaje, apoyo_id, referencia_tipo)
        VALUES (?, 'apoyo_impedido', ?, ?, 'apoyo')
    `, [apoyo.user_id, `Se informó un impedimento en tu solicitud de apoyo para "${apoyo.nombre_actividad}" (${apoyo.codigo}): ${motivo.trim()}`, id]);

    return { status: 200, mensaje: 'Impedimento registrado e informado a los administradores' };
}

module.exports = {
    getUploadDir,
    resolverTecnicoParaUsuario,
    esTecnicoAsignado,
    crearSolicitud,
    listarSolicitudes,
    obtenerSolicitudPorId,
    observarSolicitud,
    subsanarSolicitud,
    aprobarSolicitud,
    rechazarSolicitud,
    programarSolicitud,
    cancelarSolicitud,
    confirmarRecepcion,
    registrarLlegada,
    finalizarApoyo,
    informarImpedimento
};

