const test = require('node:test');
const assert = require('node:assert/strict');
const { validateTicketCreation } = require('../backend/utils/ticketValidation');

function validPayload(overrides = {}) {
    return {
        titulo: '  Problema de red ',
        descripcion: ' No hay conexión ',
        solicitante_nombre: ' Ana Prueba ',
        codigo_universitario_dni: ' 12345678 ',
        tipo_solicitante: 'estudiante',
        categoria_usuario: 'Internet',
        carrera: 'Agronomía',
        bloque: 'Bloque B',
        ambiente: 'Administración',
        oficina_id: '1',
        categoria_id: '2',
        impacto: 'Medio',
        urgencia: 'Media',
        ...overrides
    };
}

test('normalizes a valid ticket and derives its location from trusted fields', () => {
    const result = validateTicketCreation(validPayload({ ubicacion: 'forged location' }));
    assert.equal(result.error, undefined);
    assert.equal(result.value.titulo, 'Problema de red');
    assert.equal(result.value.descripcion, 'No hay conexión');
    assert.equal(result.value.solicitante_nombre, 'Ana Prueba');
    assert.equal(result.value.ubicacion, 'Bloque B - Administración');
    assert.equal(result.value.oficina_id, 1);
    assert.equal(result.value.categoria_id, 2);
});

test('rejects missing or whitespace-only required fields', () => {
    for (const field of ['titulo', 'descripcion', 'solicitante_nombre', 'codigo_universitario_dni', 'categoria_usuario']) {
        assert.ok(validateTicketCreation(validPayload({ [field]: '  ' })).error, field);
    }
});

test('requires teacher subject and validates applicant type and career', () => {
    assert.match(validateTicketCreation(validPayload({ tipo_solicitante: 'docente' })).error, /asignatura/);
    assert.ok(validateTicketCreation(validPayload({ tipo_solicitante: 'root' })).error);
    assert.ok(validateTicketCreation(validPayload({ carrera: 'Otra carrera' })).error);
});

test('validates category IDs, block/environment relationship, and classroom-only number', () => {
    assert.ok(validateTicketCreation(validPayload({ oficina_id: '1e0' })).error);
    assert.ok(validateTicketCreation(validPayload({ bloque: 'Bloque A', ambiente: 'Administración' })).error);
    assert.ok(validateTicketCreation(validPayload({ bloque: 'Bloque A', ambiente: 'Salones / Aulas' })).error);
    assert.ok(validateTicketCreation(validPayload({ aula: 101 })).error);
    const classroom = validateTicketCreation(validPayload({
        bloque: 'Bloque A',
        ambiente: 'Salones / Aulas',
        aula: '101'
    }));
    assert.equal(classroom.error, undefined);
    assert.equal(classroom.value.aula, 101);
});

test('rejects manipulated impact and urgency', () => {
    assert.ok(validateTicketCreation(validPayload({ impacto: 'Extreme' })).error);
    assert.ok(validateTicketCreation(validPayload({ urgencia: 'Critical' })).error);
});
