const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');
const { applyTestDatabaseEnvironment, ensureTestMysqlRunning } = require('../backend/config/databaseConfig');

test('verificación de limpieza automática bajo fallo controlado', async () => {
    const envFile = path.resolve(__dirname, '../.env.test.local');
    if (fs.existsSync(envFile)) {
        const env = dotenv.parse(fs.readFileSync(envFile));
        for (const [key, val] of Object.entries(env)) process.env[key] = val;
    }
    process.env.UTEA_TEST_DB_ALLOW_INTEGRATION = '1';
    const config = applyTestDatabaseEnvironment();
    await ensureTestMysqlRunning(config);
    const conn = await mysql.createConnection({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database
    });

    // 1. Obtener los identificadores existentes antes de la prueba para verificar que se conserven
    const [initialRows] = await conn.query('SELECT id FROM tickets');
    const preservedIds = initialRows.map(r => r.id);

    const testCreatedIds = [];
    let simulatedFailureOccurred = false;

    try {
        // 2. Crear un ticket de prueba y registrar su ID
        const [insertResult] = await conn.query(`
            INSERT INTO tickets (titulo, descripcion, estado, prioridad, tipo_solicitante, solicitante_nombre)
            VALUES ('Ticket prueba limpieza con fallo controlado', 'Descripción de prueba', 'Creado', 'Media', 'administrativo', 'Usuario Control')
        `);
        const createdId = insertResult.insertId;
        testCreatedIds.push(createdId);

        // Agregar registros relacionados en historial
        await conn.query(`
            INSERT INTO ticket_historial (ticket_id, accion, descripcion)
            VALUES (?, 'Creación', 'Ticket creado para prueba de resiliencia')
        `, [createdId]);

        // 3. Provocar un fallo controlado (asserción fallida simulada)
        try {
            assert.equal('resultado_inesperado', 'resultado_esperado', 'Fallo simulado para validar ejecución de finally');
        } catch (assertionError) {
            simulatedFailureOccurred = true;
            throw assertionError;
        }
    } catch (err) {
        assert.ok(simulatedFailureOccurred, 'El fallo controlado debe haberse disparado');
        assert.equal(err.code, 'ERR_ASSERTION');
    } finally {
        // 4. Ejecución de la lógica de limpieza automática
        if (testCreatedIds.length > 0) {
            await conn.query('DELETE FROM ticket_historial WHERE ticket_id IN (?)', [testCreatedIds]);
            await conn.query('DELETE FROM ticket_adjuntos WHERE ticket_id IN (?)', [testCreatedIds]);
            await conn.query('DELETE FROM comentarios WHERE ticket_id IN (?)', [testCreatedIds]);
            await conn.query('DELETE FROM tickets WHERE id IN (?)', [testCreatedIds]);
        }
    }

    // 5. Comprobar que el ticket creado por la prueba fallida fue eliminado completamente
    const [afterCheck] = await conn.query('SELECT id FROM tickets WHERE id IN (?)', [testCreatedIds]);
    assert.equal(afterCheck.length, 0, 'Los tickets creados en la prueba con fallo deben haber sido eliminados');

    const [commentsCheck] = await conn.query('SELECT id FROM comentarios WHERE ticket_id IN (?)', [testCreatedIds]);
    assert.equal(commentsCheck.length, 0, 'Los comentarios dependientes deben haber sido eliminados');

    // 6. Comprobar que los registros preexistentes se conservaron intactos
    const [finalRows] = await conn.query('SELECT id FROM tickets');
    const finalIds = finalRows.map(r => r.id);
    for (const preservedId of preservedIds) {
        assert.ok(finalIds.includes(preservedId), `El registro preexistente #${preservedId} debe conservarse`);
    }

    await conn.end();
});
