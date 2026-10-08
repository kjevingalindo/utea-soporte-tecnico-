const test = require('node:test');
const assert = require('node:assert/strict');
const {
    timestamp,
    month,
    mergeLinkedAccountIncidents,
    aggregateCategories,
    filterCategoryAndMonth,
    meanElapsedHours
} = require('../frontend/js/reporting');

test('parses SQL timestamps as Lima local time and SLA values as milliseconds', () => {
    assert.equal(month('2025-02-01 00:30:00'), '2025-02');
    assert.equal(month('2025-02-01T04:30:00.000Z'), '2025-01');
    assert.equal(timestamp('1738369800000'), 1738369800000);
    assert.equal(Number.isNaN(timestamp(null)), true);
});

test('merges linked account records for case counts while retaining both identifiers', () => {
    const result = mergeLinkedAccountIncidents(
        [{ id: 12, titulo: 'Acceso' }, { id: 13, titulo: 'Red' }],
        [{ id: 40, ticket_id: 12 }, { id: 41, ticket_id: null }]
    );
    assert.equal(result.tickets.length + result.independentAccounts.length, 3);
    assert.equal(result.tickets[0].reportAccountId, 40);
    assert.equal(result.tickets[0].reportReference, '#12 · Cuenta #40');
    assert.equal(result.independentAccounts[0].id, 41);
});

test('frequent-category counts and details use the same category and Lima month set', () => {
    const cases = [
        { id: 1, categoria_reporte: 'Red', fecha_creacion: '2026-10-01 00:20:00' },
        { id: 2, categoria_reporte: 'Red', fecha_creacion: '2026-10-15 12:00:00' },
        { id: 3, categoria_reporte: 'Equipos', fecha_creacion: '2026-10-15 12:00:00' },
        { id: 4, categoria_reporte: 'Red', fecha_creacion: '2026-11-01 00:00:00' }
    ];

    assert.deepEqual(aggregateCategories([]), []);
    assert.deepEqual(aggregateCategories(cases.filter(item => item.id === 3)), [
        { label: 'Equipos', count: 1 }
    ]);
    assert.deepEqual(aggregateCategories(cases).find(item => item.label === 'Red'), {
        label: 'Red',
        count: 3
    });

    const octoberRed = filterCategoryAndMonth(cases, 'Red', '2026-10');
    assert.deepEqual(octoberRed.map(item => item.id), [1, 2]);
    assert.equal(aggregateCategories(octoberRed)[0].count, octoberRed.length);
    assert.deepEqual(filterCategoryAndMonth(cases, 'Ausente', '2026-10'), []);
});

test('averages real millisecond SLA durations and returns no-data for empty observations', () => {
    const oneHour = 3600000;
    const records = [
        { fecha_creacion: 1738368000000, sla_resolved_at: 1738371600000 },
        { fecha_creacion: 1738368000000, sla_resolved_at: 1738386000000 },
        { fecha_creacion: 1738368000000, sla_resolved_at: null }
    ];
    assert.equal(meanElapsedHours(records, record => record.sla_resolved_at), 3);
    assert.equal(meanElapsedHours([], record => record.sla_resolved_at), null);
});
