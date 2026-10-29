const db = require('../db');
const { enviarCorreoInstitucional } = require('../utils/email');

/**
 * Helper para resolver los usuario_ids destinatarios de un apoyo
 */
async function obtenerDestinatariosApoyo(apoyo, conn) {
    const userIds = new Set();
    if (apoyo.user_id) {
        userIds.add(Number(apoyo.user_id));
    }

    if (apoyo.tecnico_id) {
        const [techUsers] = await conn.query(`
            SELECT u.id 
            FROM tecnicos t
            INNER JOIN usuarios u ON (u.username = t.nombre OR u.nombre_completo = t.nombre OR u.rol = 'tecnico')
            WHERE t.id = ?
            LIMIT 1
        `, [apoyo.tecnico_id]);

        if (techUsers.length > 0) {
            userIds.add(Number(techUsers[0].id));
        }
    }

    return Array.from(userIds);
}

/**
 * Programa los recordatorios persistentes para un evento (24h, 1h, 15m antes de hora_preparacion)
 * Si se reprograma, cancela los recordatorios anteriores pendientes para evitar duplicados.
 */
async function programarRecordatorios(apoyoId, externalConn = null) {
    const conn = externalConn || db.promise();

    const [apoyos] = await conn.query(`
        SELECT id, codigo, nombre_actividad, ambiente, bloque, fecha_evento, hora_preparacion, user_id, tecnico_id, estado
        FROM solicitudes_apoyo
        WHERE id = ?
    `, [apoyoId]);

    if (!apoyos.length) return { count: 0 };
    const apoyo = apoyos[0];

    // Cancelar recordatorios pendientes previos del apoyo para evitar duplicados
    await conn.query(`
        UPDATE apoyo_recordatorios
        SET estado = 'cancelado'
        WHERE apoyo_id = ? AND estado = 'pendiente'
    `, [apoyoId]);

    // Si el estado no es Programada o Aprobada, no programar nuevos
    if (!['Aprobada', 'Programada'].includes(apoyo.estado)) {
        return { count: 0, cancelados: true };
    }

    // Resolver fecha y hora de preparación en zona local
    const fechaStr = typeof apoyo.fecha_evento === 'string'
        ? apoyo.fecha_evento.slice(0, 10)
        : new Date(apoyo.fecha_evento).toISOString().slice(0, 10);
    const horaPrepStr = apoyo.hora_preparacion.slice(0, 8);
    const prepDatetime = new Date(`${fechaStr}T${horaPrepStr}`);

    if (isNaN(prepDatetime.getTime())) {
        return { error: 'Fecha u hora de preparación no válida para programar recordatorios' };
    }

    const recipientUserIds = await obtenerDestinatariosApoyo(apoyo, conn);
    if (!recipientUserIds.length) {
        recipientUserIds.push(apoyo.user_id);
    }

    const configs = [
        { tipo: '24h', msAntes: 24 * 60 * 60 * 1000 },
        { tipo: '1h',  msAntes: 60 * 60 * 1000 },
        { tipo: '15m', msAntes: 15 * 60 * 1000 }
    ];

    let insertedCount = 0;

    for (const userId of recipientUserIds) {
        for (const cfg of configs) {
            const fechaAviso = new Date(prepDatetime.getTime() - cfg.msAntes);
            // Formatear a 'YYYY-MM-DD HH:mm:ss'
            const yyyy = fechaAviso.getFullYear();
            const mm = String(fechaAviso.getMonth() + 1).padStart(2, '0');
            const dd = String(fechaAviso.getDate()).padStart(2, '0');
            const hh = String(fechaAviso.getHours()).padStart(2, '0');
            const mi = String(fechaAviso.getMinutes()).padStart(2, '0');
            const ss = String(fechaAviso.getSeconds()).padStart(2, '0');
            const fechaAvisoSql = `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;

            await conn.query(`
                INSERT INTO apoyo_recordatorios (apoyo_id, usuario_id, tipo_aviso, fecha_programada_aviso, estado)
                VALUES (?, ?, ?, ?, 'pendiente')
            `, [apoyoId, userId, cfg.tipo, fechaAvisoSql]);
            insertedCount++;
        }
    }

    return { count: insertedCount, prepDatetime };
}

/**
 * Procesa recordatorios pendientes que ya vencieron en base al reloj actual (o simulado)
 * @param {Date|string} [ahoraSimulado] - Permite inyectar reloj controlado para tests
 * @param {number} [apoyoIdFilter] - Permite filtrar recordatorios de un apoyo específico
 */
async function procesarRecordatorios(ahoraSimulado = null, apoyoIdFilter = null) {
    const conn = db.promise();
    const now = ahoraSimulado ? new Date(ahoraSimulado) : new Date();

    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mi = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const nowSql = `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;

    let sql = `
        SELECT r.id, r.apoyo_id, r.usuario_id, r.tipo_aviso, r.fecha_programada_aviso,
               a.codigo, a.nombre_actividad, a.bloque, a.ambiente, a.fecha_evento, a.hora_preparacion, a.hora_inicio,
               u.correo_institucional, u.nombre_completo, u.username
        FROM apoyo_recordatorios r
        INNER JOIN solicitudes_apoyo a ON a.id = r.apoyo_id
        INNER JOIN usuarios u ON u.id = r.usuario_id
        WHERE r.estado = 'pendiente'
          AND r.fecha_programada_aviso <= ?
          AND a.estado IN ('Aprobada', 'Programada', 'En atencion')
    `;
    const params = [nowSql];
    if (apoyoIdFilter) {
        sql += ' AND r.apoyo_id = ?';
        params.push(apoyoIdFilter);
    }
    sql += ' ORDER BY r.fecha_programada_aviso ASC';

    const [pendientes] = await conn.query(sql, params);

    const enviados = [];

    for (const rec of pendientes) {
        const tiempoTexto = rec.tipo_aviso === '24h' ? '24 horas' : rec.tipo_aviso === '1h' ? '1 hora' : '15 minutos';
        const mensaje = `Recordatorio (${tiempoTexto}): El apoyo técnico para "${rec.nombre_actividad}" (${rec.codigo}) en ${rec.ambiente} (${rec.bloque}) inicia preparación a las ${rec.hora_preparacion.slice(0, 5)}.`;

        // 1. Notificación en BD
        await conn.query(`
            INSERT INTO notificaciones (user_id, tipo, mensaje, apoyo_id, referencia_tipo)
            VALUES (?, 'recordatorio_apoyo', ?, ?, 'apoyo')
        `, [rec.usuario_id, mensaje, rec.apoyo_id]);

        // 2. Email institucional (simulado o SMTP)
        const destinatario = rec.correo_institucional || `${rec.username}@utea.edu.pe`;
        try {
            await enviarCorreoInstitucional(
                destinatario,
                `Recordatorio de Apoyo Técnico UTEA: ${rec.codigo}`,
                rec.nombre_actividad,
                mensaje,
                rec.codigo
            );
        } catch (mailErr) {
            console.warn(`[apoyosReminders] No se pudo enviar correo a ${destinatario}:`, mailErr.message);
        }

        // 3. Marcar como enviado
        await conn.query(`
            UPDATE apoyo_recordatorios
            SET estado = 'enviado', enviado_at = ?
            WHERE id = ?
        `, [nowSql, rec.id]);

        enviados.push({
            id: rec.id,
            apoyo_id: rec.apoyo_id,
            usuario_id: rec.usuario_id,
            tipo_aviso: rec.tipo_aviso,
            enviado_at: nowSql
        });
    }

    return {
        ejecutadoEn: nowSql,
        totalProcesados: enviados.length,
        enviados
    };
}

module.exports = {
    programarRecordatorios,
    procesarRecordatorios
};

