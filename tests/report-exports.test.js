const test = require('node:test');
const assert = require('node:assert/strict');
const {
    buildCsv,
    buildPdfHtml
} = require('../frontend/js/reportExports');

const ticket = {
    id: 12,
    titulo: 'Falla "de prueba"',
    solicitante_nombre: '<script>alert(1)</script>',
    oficina_nombre: 'Oficina A',
    categoria_nombre: 'Redes',
    tecnico: null,
    prioridad: 'Media',
    estado: 'En proceso',
    fecha_creacion: '2026-10-02T12:00:00Z',
    reportResolvedAt: '2026-10-08T12:00:00Z'
};

function exportContext() {
    return {
        monthLabel: 'octubre de 2026',
        tickets: [ticket],
        resolved: [ticket],
        open: [ticket],
        metrics: {
            registeredResolutionPct: 0,
            registeredResolved: [],
            resolutionHours: null
        },
        formatDuration: hours => hours === null ? 'Sin datos' : `${hours.toFixed(1)} h`,
        timestamp: value => new Date(value).getTime()
    };
}

test('CSV keeps the two monthly KPIs distinct and uses Lima dates and explicit missing values', () => {
    const csv = buildCsv(exportContext());
    assert.match(csv, /Casos resueltos durante el mes","1"/);
    assert.match(csv, /Resolución de casos registrados durante el mes","0%"/);
    assert.match(csv, /Productividad: casos resueltos durante el mes/);
    assert.match(csv, /2\/10\/2026/);
    assert.match(csv, /Oficina A/);
    assert.match(csv, /Sin asignar/);
    assert.match(csv, /"Falla ""de prueba"""/);
});

test('PDF print view escapes user markup and includes separate productivity and cohort figures', () => {
    const html = buildPdfHtml(exportContext());
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
    assert.match(html, /Casos resueltos durante el mes<\/span><strong>1/);
    assert.match(html, /Resolución de los registrados este mes<\/span><strong>0%/);
    assert.match(html, /Productividad: casos resueltos durante el mes/);
    assert.match(html, /Sin asignar/);
});
