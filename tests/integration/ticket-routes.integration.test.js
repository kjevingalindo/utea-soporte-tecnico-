const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const enabled = process.env.UTEA_TEST_DB_ALLOW_INTEGRATION === '1' &&
    /_test$/i.test(process.env.UTEA_TEST_DB_NAME || '') &&
    Boolean(process.env.UTEA_TEST_DB_HOST && process.env.UTEA_TEST_DB_USER);

if (enabled) {
    process.env.DB_HOST = process.env.UTEA_TEST_DB_HOST;
    process.env.DB_PORT = process.env.UTEA_TEST_DB_PORT || '3306';
    process.env.DB_USER = process.env.UTEA_TEST_DB_USER;
    process.env.DB_PASSWORD = process.env.UTEA_TEST_DB_PASSWORD || '';
    process.env.DB_NAME = process.env.UTEA_TEST_DB_NAME;
    process.env.JWT_SECRET = 'utea-integration-test-only-secret';
}

test('ticket API creation idempotency, server validation, concurrent transitions, and KPI values', {
    skip: !enabled ? 'Set UTEA_TEST_DB_ALLOW_INTEGRATION=1 and UTEA_TEST_DB_* to an isolated *_test schema' : false
}, async t => {
    const express = require('express');
    const jwt = require('jsonwebtoken');
    const Module = require('module');
    const db = require('../../backend/db');
    const notificationsPath = require.resolve('../../backend/routes/notifications');
    const notificationsStub = new Module(notificationsPath, module);
    notificationsStub.filename = notificationsPath;
    notificationsStub.loaded = true;
    notificationsStub.exports = { crearNotificacion: async () => {} };
    require.cache[notificationsPath] = notificationsStub;
    const ticketRoutes = require('../../backend/routes/tickets');
    const statsRoutes = require('../../backend/routes/stats');
    const accountRoutes = require('../../backend/routes/cuentas.routes');
    const accountService = require('../../backend/services/cuentas.service');
    const app = express();
    app.use(express.json());
    app.use('/api/tickets', ticketRoutes);
    app.use('/api/stats', statsRoutes);
    app.use('/api/cuentas', accountRoutes);

    const server = app.listen(0, '127.0.0.1');
    let evidenceFilePath;
    let evidenceIncidentId;
    await new Promise((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
    });
    const suffix = crypto.randomUUID();
    t.after(async () => {
        if (evidenceFilePath) await fs.promises.unlink(evidenceFilePath).catch(() => {});
        if (evidenceIncidentId) {
            await new Promise(resolve => db.query(
                'DELETE FROM incidencias_cuentas WHERE id = ?',
                [evidenceIncidentId],
                () => resolve()
            ));
        }
        await accountService.close();
        await new Promise(resolve => server.close(resolve));
        await new Promise(resolve => db.end(resolve));
    });

    const [accountOwner] = await new Promise((resolve, reject) => {
        db.query(
            'INSERT INTO usuarios (username, password, rol) VALUES (?, ?, ?)',
            [`account-owner-${suffix}`, 'test-only-not-a-credential', 'usuario'],
            (error, result) => error ? reject(error) : resolve([result])
        );
    });
    const [unrelatedUser] = await new Promise((resolve, reject) => {
        db.query(
            'INSERT INTO usuarios (username, password, rol) VALUES (?, ?, ?)',
            [`account-unrelated-${suffix}`, 'test-only-not-a-credential', 'usuario'],
            (error, result) => error ? reject(error) : resolve([result])
        );
    });
    const [userResult] = await new Promise((resolve, reject) => {
        db.query(
            'INSERT INTO usuarios (username, password, rol) VALUES (?, ?, ?)',
            [`ticket-integration-${suffix}`, 'test-only-not-a-credential', 'admin'],
            (error, result) => error ? reject(error) : resolve([result])
        );
    });
    const [[category]] = await new Promise((resolve, reject) => {
        db.query(
            `SELECT c.id AS categoria_id, c.oficina_id
             FROM categorias c INNER JOIN oficinas o ON o.id = c.oficina_id
             WHERE c.activo = TRUE AND o.activo = TRUE LIMIT 1`,
            (error, rows) => error ? reject(error) : resolve([rows])
        );
    });
    assert.ok(category, 'The isolated schema must have an active office and category');

    const token = jwt.sign({ id: userResult.insertId }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const ownerToken = jwt.sign({ id: accountOwner.insertId }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const unrelatedToken = jwt.sign({ id: unrelatedUser.insertId }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const [[platform]] = await new Promise((resolve, reject) => {
        db.query('SELECT id FROM plataformas WHERE activo = TRUE ORDER BY id LIMIT 1',
            (error, rows) => error ? reject(error) : resolve([rows]));
    });
        assert.ok(platform, 'The isolated schema must contain an active account platform');
    const [incidentResult] = await new Promise((resolve, reject) => {
        db.query(
            `INSERT INTO incidencias_cuentas
                (plataforma_id, usuario_id, tipo_usuario, dni_codigo, nombres, apellidos, tipo_problema, descripcion)
             VALUES (?, ?, 'docente', 'EVIDENCE-TEST', 'Persona', 'Propietaria', 'Descarga', 'Prueba ficticia')`,
            [platform.id, accountOwner.insertId],
            (error, result) => error ? reject(error) : resolve([result])
        );
    });
    evidenceIncidentId = incidentResult.insertId;
    const evidenceFileName = `${crypto.randomUUID()}.pdf`;
    evidenceFilePath = path.resolve(__dirname, '../../backend/uploads/cuentas', evidenceFileName);
    const evidenceBytes = Buffer.from('%PDF-1.4\nFictitious test evidence\n%%EOF\n');
    await fs.promises.writeFile(evidenceFilePath, evidenceBytes);
    const [evidenceResult] = await new Promise((resolve, reject) => {
        db.query(
            `INSERT INTO incidencia_cuenta_evidencias
                (incidencia_id, usuario_id, tipo, nombre_original, nombre_archivo, tipo_mime, tamano_bytes)
             VALUES (?, ?, 'EVIDENCIA_INICIAL', 'test.pdf', ?, 'application/pdf', ?)`,
            [evidenceIncidentId, accountOwner.insertId, evidenceFileName, evidenceBytes.length],
            (error, result) => error ? reject(error) : resolve([result])
        );
    });
    const evidenceUrl = `${baseUrl}/api/cuentas/incidencias/${evidenceIncidentId}/evidencias/${evidenceResult.insertId}/descargar`;
    const ownerDownload = await fetch(evidenceUrl, { headers: { Authorization: `Bearer ${ownerToken}` } });
    assert.equal(ownerDownload.status, 200);
    assert.deepEqual(Buffer.from(await ownerDownload.arrayBuffer()), evidenceBytes);
    const unrelatedDownload = await fetch(evidenceUrl, {
        headers: { Authorization: `Bearer ${unrelatedToken}` }
    });
    assert.equal(unrelatedDownload.status, 403);

    const ticketPayload = {
        titulo: 'Ticket de integración',
        descripcion: 'Solicitud ficticia de regresión',
        categoria_usuario: 'Internet',
        impacto: 'Medio',
        urgencia: 'Media',
        oficina_id: category.oficina_id,
        categoria_id: category.categoria_id,
        carrera: 'Ingeniería Civil',
        bloque: 'Bloque A',
        ambiente: 'Auditorio',
        aula: null,
        solicitante_nombre: 'Persona de prueba',
        codigo_universitario_dni: suffix.slice(0, 30),
        tipo_solicitante: 'estudiante'
    };
    const idempotencyKey = `ticket-${suffix}`;

    const invalid = await fetch(`${baseUrl}/api/tickets`, {
        method: 'POST',
        headers: { ...headers, 'Idempotency-Key': `invalid-${suffix}` },
        body: JSON.stringify({ ...ticketPayload, titulo: '   ' })
    });
    assert.equal(invalid.status, 400);

    const createRequests = await Promise.all([
        fetch(`${baseUrl}/api/tickets`, {
            method: 'POST',
            headers: { ...headers, 'Idempotency-Key': idempotencyKey },
            body: JSON.stringify(ticketPayload)
        }),
        fetch(`${baseUrl}/api/tickets`, {
            method: 'POST',
            headers: { ...headers, 'Idempotency-Key': idempotencyKey },
            body: JSON.stringify(ticketPayload)
        })
    ]);
    const createResponses = await Promise.all(createRequests.map(response => response.json()));
    assert.ok(createRequests.every(response => [200, 201].includes(response.status)));
    assert.equal(createResponses[0].ticketId, createResponses[1].ticketId);
    const ticketId = createResponses[0].ticketId;
    const [[{ ticketCount }]] = await new Promise((resolve, reject) => {
        db.query(
            'SELECT COUNT(*) AS ticketCount FROM tickets WHERE user_id = ? AND idempotency_key = ?',
            [userResult.insertId, idempotencyKey],
            (error, rows) => error ? reject(error) : resolve([rows])
        );
    });
    assert.equal(Number(ticketCount), 1);

    const update = (state, id = ticketId) => fetch(`${baseUrl}/api/tickets/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ estado: state })
    });
    assert.equal((await update('Estado inventado')).status, 400);
    assert.equal((await update('Solucionado')).status, 409);
    assert.equal((await update('Clasificado')).status, 200);
    assert.equal((await update('Asignado')).status, 200);
    assert.equal((await update('En proceso')).status, 200);

    const simultaneous = await Promise.all([
        update('Esperando usuario'),
        update('Solucionado')
    ]);
    assert.deepEqual(simultaneous.map(response => response.status).sort(), [200, 409]);

    const [[{ currentState }]] = await new Promise((resolve, reject) => {
        db.query('SELECT estado AS currentState FROM tickets WHERE id = ?', [ticketId],
            (error, rows) => error ? reject(error) : resolve([rows]));
    });
    if (currentState === 'Esperando usuario') {
        assert.equal((await update('En proceso')).status, 200);
        assert.equal((await update('Solucionado')).status, 200);
    }

    await new Promise((resolve, reject) => {
        db.query(
            `UPDATE tickets
             SET fecha_creacion = DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 3 HOUR),
                 sla_first_response_at = (UNIX_TIMESTAMP(DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 3 HOUR)) * 1000) + 3600000,
                 sla_response_due_at = (UNIX_TIMESTAMP(DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 3 HOUR)) * 1000) + 7200000,
                 sla_resolved_at = (UNIX_TIMESTAMP(DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 3 HOUR)) * 1000) + 7200000,
                 sla_resolution_due_at = (UNIX_TIMESTAMP(DATE_SUB(CURRENT_TIMESTAMP, INTERVAL 3 HOUR)) * 1000) + 14400000
             WHERE id = ?`,
            [ticketId],
            error => error ? reject(error) : resolve()
        );
    });

    const ticketListResponse = await fetch(`${baseUrl}/api/tickets`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(ticketListResponse.status, 200);
    const listedTickets = await ticketListResponse.json();
    const listedTicket = listedTickets.find(ticket => Number(ticket.id) === Number(ticketId));
    assert.ok(listedTicket.report_resolutions_ms);

    const statsResponse = await fetch(`${baseUrl}/api/stats`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(statsResponse.status, 200);
    const stats = await statsResponse.json();
    assert.equal(stats.csatPromedio, null);
    assert.equal(stats.primeraRespuestaPromedioHoras, 1);
    assert.equal(stats.tiempoPromedioHoras, 2);
    assert.equal(stats.cumplimientoSlaRespuestaPct, 100);
    assert.equal(stats.cumplimientoSlaResolucionPct, 100);
});
