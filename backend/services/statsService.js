const db = require('../db');

function monthWindowInLima() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const [year, month] = [Number(values.year), Number(values.month)];
  const start = new Date(Date.UTC(year, month - 6, 1, 5));
  const end = new Date(Date.UTC(year, month, 1, 5));
  return {
    startEpoch: Math.floor(start.getTime() / 1000),
    endEpoch: Math.floor(end.getTime() / 1000)
  };
}

function safeAvg(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
    return Number(Number(value).toFixed(1));
}

async function getDashboardSummary() {
    const promiseDb = db.promise();
    const [[{ total }]] = await promiseDb.query('SELECT COUNT(*) AS total FROM tickets');
    const [porEstadoRows] = await promiseDb.query('SELECT estado, COUNT(*) AS cantidad FROM tickets GROUP BY estado');
    const porEstadoMap = Object.fromEntries(porEstadoRows.map(row => [row.estado, Number(row.cantidad)]));
    const pendientes = ['Creado', 'Clasificado', 'Asignado'].reduce((sum, state) => sum + (porEstadoMap[state] || 0), 0);
    const enProceso = ['En proceso', 'Esperando usuario'].reduce((sum, state) => sum + (porEstadoMap[state] || 0), 0);
    const solucionados = ['Solucionado', 'Cerrado'].reduce((sum, state) => sum + (porEstadoMap[state] || 0), 0);
    const [[{ criticos }]] = await promiseDb.query(`SELECT COUNT(*) AS criticos FROM tickets WHERE prioridad IN ('Alta', 'Urgente', 'Critica') AND estado NOT IN ('Solucionado', 'Cerrado')`);
    const [[survey]] = await promiseDb.query('SELECT AVG(calificacion) AS promedio, COUNT(*) AS conteo FROM ticket_encuestas');
    const [[firstResponseRow]] = await promiseDb.query(`
        SELECT AVG((sla_first_response_at - UNIX_TIMESTAMP(fecha_creacion) * 1000) / 3600000) AS primeraRespuestaPromedioHoras
        FROM tickets
        WHERE sla_first_response_at IS NOT NULL
          AND fecha_creacion IS NOT NULL
          AND sla_first_response_at >= UNIX_TIMESTAMP(fecha_creacion) * 1000
    `);
    const [[resolutionRow]] = await promiseDb.query(`
        SELECT AVG((sla_resolved_at - UNIX_TIMESTAMP(fecha_creacion) * 1000) / 3600000) AS tiempoPromedioHoras
        FROM tickets
        WHERE sla_resolved_at IS NOT NULL
          AND fecha_creacion IS NOT NULL
          AND sla_resolved_at >= UNIX_TIMESTAMP(fecha_creacion) * 1000
          AND estado IN ('Solucionado', 'Cerrado')
    `);
    const [[responseComplianceRow]] = await promiseDb.query(`
        SELECT AVG(CASE WHEN sla_first_response_at IS NOT NULL AND sla_first_response_at <= sla_response_due_at THEN 1 ELSE 0 END) * 100 AS cumplimientoSlaRespuestaPct
        FROM tickets
        WHERE sla_response_due_at IS NOT NULL
    `);
    const [[resolutionComplianceRow]] = await promiseDb.query(`
        SELECT AVG(CASE WHEN sla_resolved_at IS NOT NULL AND sla_resolved_at <= sla_resolution_due_at THEN 1 ELSE 0 END) * 100 AS cumplimientoSlaResolucionPct
        FROM tickets
        WHERE sla_resolution_due_at IS NOT NULL
          AND estado IN ('Solucionado', 'Cerrado')
    `);
    const { startEpoch, endEpoch } = monthWindowInLima();
    const [monthlyRows] = await promiseDb.execute(`SELECT DATE_FORMAT(COALESCE(CONVERT_TZ(fecha_creacion, @@session.time_zone, '-05:00'), fecha_creacion), '%Y-%m') AS mes, COUNT(*) AS cantidad FROM tickets WHERE fecha_creacion >= FROM_UNIXTIME(?) AND fecha_creacion < FROM_UNIXTIME(?) GROUP BY mes ORDER BY mes DESC LIMIT 6`, [startEpoch, endEpoch]);
    return {
        total: Number(total),
        pendientes,
        enProceso,
        solucionados,
        criticos: Number(criticos),
        csatPromedio: Number(survey.conteo) ? Number(Number(survey.promedio).toFixed(1)) : null,
        primeraRespuestaPromedioHoras: safeAvg(firstResponseRow.primeraRespuestaPromedioHoras),
        tiempoPromedioHoras: safeAvg(resolutionRow.tiempoPromedioHoras),
        cumplimientoSlaRespuestaPct: safeAvg(responseComplianceRow.cumplimientoSlaRespuestaPct),
        cumplimientoSlaResolucionPct: safeAvg(resolutionComplianceRow.cumplimientoSlaResolucionPct),
        evolucionMensual: monthlyRows.reverse().map(row => ({ ...row, cantidad: Number(row.cantidad) }))
    };
}

async function getPersonalDashboardSummary(userId) {
    const promiseDb = db.promise();
    const [[ticketSummary]] = await promiseDb.execute(`
        SELECT COUNT(*) AS total,
               COALESCE(SUM(estado IN ('Creado', 'Clasificado', 'Asignado')), 0) AS pendientes,
               COALESCE(SUM(estado IN ('En proceso', 'Esperando usuario')), 0) AS enProceso,
               COALESCE(SUM(estado IN ('Solucionado', 'Cerrado')), 0) AS solucionados,
               COALESCE(SUM(prioridad IN ('Alta', 'Urgente', 'Critica')
                            AND estado NOT IN ('Solucionado', 'Cerrado')), 0) AS criticos
        FROM tickets
        WHERE user_id = ?
    `, [userId]);
    const [[accountSummary]] = await promiseDb.execute(
        'SELECT COUNT(*) AS incidenciasCuentas FROM incidencias_cuentas WHERE usuario_id = ?',
        [userId]
    );

    const total = Number(ticketSummary.total);
    const solucionados = Number(ticketSummary.solucionados);
    return {
        total,
        pendientes: Number(ticketSummary.pendientes),
        enProceso: Number(ticketSummary.enProceso),
        solucionados,
        criticos: Number(ticketSummary.criticos),
        incidenciasCuentas: Number(accountSummary.incidenciasCuentas),
        tasaResolucionPct: total ? Math.round(solucionados * 100 / total) : 0
    };
}

module.exports = {
    getDashboardSummary,
    getPersonalDashboardSummary,
    monthWindowInLima
};
