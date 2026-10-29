const db = require('../db');

/**
 * Servicio de métricas e indicadores para Solicitudes de Apoyo Técnico
 * Diferencia los apoyos a eventos (servicios programados) de las incidencias/tickets de soporte.
 */
async function obtenerEstadisticasApoyos(filtros = {}) {
    const conn = db.promise();
    const conditions = [];
    const params = [];

    if (filtros.fecha_desde) {
        conditions.push('fecha_evento >= ?');
        params.push(filtros.fecha_desde);
    }
    if (filtros.fecha_hasta) {
        conditions.push('fecha_evento <= ?');
        params.push(filtros.fecha_hasta);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // 1. Conteo total y por estados
    const [estadoRows] = await conn.query(`
        SELECT estado, COUNT(*) as cantidad
        FROM solicitudes_apoyo
        ${whereClause}
        GROUP BY estado
    `, params);

    const porEstado = Object.fromEntries(estadoRows.map(r => [r.estado, Number(r.cantidad)]));
    const solicitados = estadoRows.reduce((sum, r) => sum + Number(r.cantidad), 0);
    const programados = (porEstado['Programada'] || 0) + (porEstado['Aprobada'] || 0) + (porEstado['En atencion'] || 0);
    const finalizados = porEstado['Finalizada'] || 0;
    const rechazados = porEstado['Rechazada'] || 0;
    const cancelados = porEstado['Cancelada'] || 0;
    const impedidos = porEstado['Impedida'] || 0;

    // 2. Conteo de "Atención pendiente de registrar"
    // Aquellas solicitudes programadas cuya hora programada de inicio ya transcurrió sin registro de llegada
    const [pendientesLlegadaRows] = await conn.query(`
        SELECT COUNT(*) as cantidad
        FROM solicitudes_apoyo
        WHERE estado = 'Programada'
          AND llegada_registrada_at IS NULL
          AND TIMESTAMP(fecha_evento, hora_inicio) < NOW()
          ${conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : ''}
    `, params);
    const atencionPendienteRegistrar = Number(pendientesLlegadaRows[0]?.cantidad || 0);

    // 3. Ambientes con mayor demanda
    const [ambientesRows] = await conn.query(`
        SELECT bloque, ambiente, COUNT(*) as total
        FROM solicitudes_apoyo
        ${whereClause}
        GROUP BY bloque, ambiente
        ORDER BY total DESC
        LIMIT 10
    `, params);

    // 4. Tipos de apoyo más solicitados (procesando el JSON apoyos_requeridos)
    const [apoyosRows] = await conn.query(`
        SELECT apoyos_requeridos
        FROM solicitudes_apoyo
        ${whereClause}
    `, params);

    const frecuenciasTipo = {};
    for (const row of apoyosRows) {
        let list = [];
        try {
            list = typeof row.apoyos_requeridos === 'string'
                ? JSON.parse(row.apoyos_requeridos)
                : row.apoyos_requeridos;
        } catch (_) {
            list = [];
        }
        if (Array.isArray(list)) {
            list.forEach(item => {
                const key = String(item).trim().toLowerCase();
                if (key) {
                    frecuenciasTipo[key] = (frecuenciasTipo[key] || 0) + 1;
                }
            });
        }
    }

    const tiposMasSolicitados = Object.entries(frecuenciasTipo)
        .map(([tipo, cantidad]) => ({ tipo, cantidad }))
        .sort((a, b) => b.cantidad - a.cantidad);

    // 5. Tiempo promedio de cobertura (duración de los apoyos en horas)
    // Calculado entre hora_preparacion y hora_fin
    const [coberturaRows] = await conn.query(`
        SELECT 
            AVG(TIME_TO_SEC(TIMEDIFF(hora_fin, hora_preparacion)) / 3600) as duracion_total_promedio_horas,
            AVG(TIME_TO_SEC(TIMEDIFF(hora_fin, hora_inicio)) / 3600) as duracion_evento_promedio_horas
        FROM solicitudes_apoyo
        ${whereClause}
    `, params);

    const duracionTotalHoras = coberturaRows[0]?.duracion_total_promedio_horas !== null
        ? Number(Number(coberturaRows[0]?.duracion_total_promedio_horas).toFixed(2))
        : 0;

    const duracionEventoHoras = coberturaRows[0]?.duracion_evento_promedio_horas !== null
        ? Number(Number(coberturaRows[0]?.duracion_evento_promedio_horas).toFixed(2))
        : 0;

    return {
        tipoServicio: 'servicios_programados_apoyo',
        solicitados,
        programados,
        finalizados,
        atencionPendienteRegistrar,
        rechazados,
        cancelados,
        impedidos,
        porEstado,
        ambientesMayorDemanda: ambientesRows.map(r => ({
            bloque: r.bloque,
            ambiente: r.ambiente,
            total: Number(r.total)
        })),
        tiposMasSolicitados,
        tiempoPromedioCoberturaHoras: duracionTotalHoras,
        tiempoPromedioEventoHoras: duracionEventoHoras
    };
}

module.exports = {
    obtenerEstadisticasApoyos
};

