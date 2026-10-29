const db = require('../db');

/**
 * Detecta cruces de horario para ambiente y técnico
 * 
 * Regla: Dos apoyos se cruzan si ocurren en la misma fecha y sus intervalos
 * [hora_preparacion, hora_fin] se solapan:
 *   solape = (apoyo.hora_preparacion < req_hora_fin) AND (apoyo.hora_fin > req_hora_preparacion)
 */
async function detectarConflictos({ apoyoId = null, fecha_evento, hora_preparacion, hora_fin, bloque, ambiente, tecnico_id = null }) {
    const promiseDb = db.promise();
    const conflicts = [];

    // 1. Conflicto de Ambiente
    const [ambientRows] = await promiseDb.query(`
        SELECT id, codigo, nombre_actividad, hora_preparacion, hora_inicio, hora_fin, estado
        FROM solicitudes_apoyo
        WHERE fecha_evento = ?
          AND bloque = ?
          AND ambiente = ?
          AND estado IN ('Aprobada', 'Programada', 'En atencion')
          AND (? IS NULL OR id != ?)
          AND (hora_preparacion < ? AND hora_fin > ?)
    `, [fecha_evento, bloque, ambiente, apoyoId, apoyoId, hora_fin, hora_preparacion]);

    if (ambientRows.length > 0) {
        for (const row of ambientRows) {
            conflicts.push({
                tipo: 'ambiente',
                mensaje: `El ambiente "${ambiente}" (${bloque}) ya está reservado por el evento "${row.nombre_actividad}" (${row.codigo}) de ${row.hora_preparacion.slice(0, 5)} a ${row.hora_fin.slice(0, 5)}.`,
                conflictoCon: row
            });
        }
    }

    // 2. Conflicto de Técnico (si se asigna técnico)
    if (tecnico_id) {
        const [techRows] = await promiseDb.query(`
            SELECT id, codigo, nombre_actividad, hora_preparacion, hora_inicio, hora_fin, estado
            FROM solicitudes_apoyo
            WHERE fecha_evento = ?
              AND tecnico_id = ?
              AND estado IN ('Programada', 'En atencion')
              AND (? IS NULL OR id != ?)
              AND (hora_preparacion < ? AND hora_fin > ?)
        `, [fecha_evento, tecnico_id, apoyoId, apoyoId, hora_fin, hora_preparacion]);

        if (techRows.length > 0) {
            for (const row of techRows) {
                conflicts.push({
                    tipo: 'tecnico',
                    mensaje: `El técnico seleccionado ya tiene asignado el evento "${row.nombre_actividad}" (${row.codigo}) de ${row.hora_preparacion.slice(0, 5)} a ${row.hora_fin.slice(0, 5)} en ese horario.`,
                    conflictoCon: row
                });
            }
        }
    }

    return {
        hasConflict: conflicts.length > 0,
        conflicts
    };
}

module.exports = { detectarConflictos };

