const test = require('node:test');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const crypto = require('crypto');

const enabled = process.env.UTEA_TEST_DB_ALLOW_INTEGRATION === '1' &&
    /_test$/i.test(process.env.UTEA_TEST_DB_NAME || '') &&
    Boolean(process.env.UTEA_TEST_DB_HOST && process.env.UTEA_TEST_DB_USER);

if (enabled) {
    process.env.DB_HOST = process.env.UTEA_TEST_DB_HOST;
    process.env.DB_PORT = process.env.UTEA_TEST_DB_PORT || '3306';
    process.env.DB_USER = process.env.UTEA_TEST_DB_USER;
    process.env.DB_PASSWORD = process.env.UTEA_TEST_DB_PASSWORD || '';
    process.env.DB_NAME = process.env.UTEA_TEST_DB_NAME;
}

test('account incident idempotency, linking permissions, and locked state changes', {
    skip: !enabled ? 'Set UTEA_TEST_DB_ALLOW_INTEGRATION=1 and UTEA_TEST_DB_* to an isolated *_test schema' : false
}, async t => {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });
    const service = require('../../backend/services/cuentas.service');
    t.after(async () => {
        await service.close();
        await connection.end();
    });

    const suffix = crypto.randomUUID();
    const [userResult] = await connection.execute(
        'INSERT INTO usuarios (username, password, rol) VALUES (?, ?, ?)',
        [`integration-${suffix}`, 'test-only-not-a-credential', 'usuario']
    );
    const [otherUserResult] = await connection.execute(
        'INSERT INTO usuarios (username, password, rol) VALUES (?, ?, ?)',
        [`integration-other-${suffix}`, 'test-only-not-a-credential', 'usuario']
    );
    const [[platform]] = await connection.execute(
        'SELECT id FROM plataformas WHERE activo = TRUE ORDER BY id LIMIT 1'
    );
    assert.ok(platform, 'The test schema must contain an active seeded platform');

    const key = `integration-${suffix}`;
    const incident = {
        plataforma_id: platform.id,
        oficina_id: null,
        ticket_id: null,
        usuario_id: userResult.insertId,
        user_role: 'usuario',
        idempotency_key: key,
        idempotency_hash: 'a'.repeat(64),
        tipo_usuario: 'docente',
        dni_codigo: suffix.slice(0, 30),
        nombres: 'Persona de prueba',
        apellidos: 'Integración',
        correo_alternativo: null,
        telefono: null,
        facultad: null,
        tipo_problema: 'Acceso de prueba',
        descripcion: 'Incidencia ficticia para prueba de concurrencia',
        prioridad: 'MEDIA',
        file: null
    };

    const created = await Promise.all([
        service.createIncident(incident),
        service.createIncident(incident)
    ]);
    assert.equal(created[0].id, created[1].id);
    assert.equal(created.filter(result => result.replayed).length, 1);

    await assert.rejects(
        service.createIncident({ ...incident, idempotency_hash: 'b'.repeat(64) }),
        error => error.status === 409
    );

    const [ticketResult] = await connection.execute(
        'INSERT INTO tickets (titulo, descripcion, user_id) VALUES (?, ?, ?)',
        ['Ticket ajeno de prueba', 'Registro ficticio', otherUserResult.insertId]
    );
    await assert.rejects(
        service.createIncident({
            ...incident,
            idempotency_key: `linked-${suffix}`,
            ticket_id: ticketResult.insertId,
            idempotency_hash: 'c'.repeat(64)
        }),
        error => error.status === 403
    );

    const escalationAttempts = await Promise.allSettled([
        service.escalateIncident(created[0].id, userResult.insertId, 'Prueba concurrente A'),
        service.escalateIncident(created[0].id, userResult.insertId, 'Prueba concurrente B')
    ]);
    assert.equal(escalationAttempts.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(escalationAttempts.filter(result =>
        result.status === 'rejected' && result.reason.status === 409
    ).length, 1);

    const resolution = await service.resolveIncident(created[0].id, userResult.insertId, 'Resolución de prueba');
    assert.equal(resolution.estado, 'RESUELTO');
    await assert.rejects(
        service.resolveIncident(created[0].id, userResult.insertId, 'Resolución duplicada'),
        error => error.status === 409
    );
});
