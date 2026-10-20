const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');
const { applyTestDatabaseEnvironment, ensureTestMysqlRunning } = require('../backend/config/databaseConfig');

function getEnvironmentFile(args) {
    const index = args.indexOf('--test-config');
    if (index < 0 || !args[index + 1]) {
        throw new Error('Uso: node scripts/seed-test-browser-users.js --test-config <archivo>');
    }
    return path.resolve(args[index + 1]);
}

function getUsernamePrefix(args) {
    const index = args.indexOf('--prefix');
    if (index < 0) return '';
    const prefix = args[index + 1];
    if (!prefix || !/^[a-z][a-z0-9_]{2,20}$/i.test(prefix)) {
        throw new Error('--prefix debe tener entre 3 y 21 caracteres alfanuméricos o guiones bajos y empezar por una letra.');
    }
    return `${prefix.toLowerCase()}_`;
}

async function main() {
    const args = process.argv.slice(2);
    const envFile = getEnvironmentFile(args);
    const prefix = getUsernamePrefix(args);
    const env = dotenv.parse(fs.readFileSync(envFile));
    env.UTEA_TEST_DB_ALLOW_INTEGRATION = '1';
    const config = applyTestDatabaseEnvironment(env);
    await ensureTestMysqlRunning(config);
    const seedPassword = process.env.UTEA_TEST_SEED_PASSWORD;
    if (!seedPassword || seedPassword.length < 12) {
        throw new Error('Define UTEA_TEST_SEED_PASSWORD con al menos 12 caracteres solo para este proceso.');
    }

    const connection = await mysql.createConnection({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database
    });
    try {
        const [[identity]] = await connection.query(
            'SELECT DATABASE() AS databaseName, @@port AS serverPort, @@datadir AS dataDirectory'
        );
        if (identity.databaseName !== config.database || Number(identity.serverPort) !== config.port) {
            throw new Error('La conexión no coincide con el esquema y puerto de pruebas configurados.');
        }
        const [offices] = await connection.query(
            'SELECT id FROM oficinas WHERE activo = TRUE ORDER BY id'
        );
        if (!offices.length) throw new Error('El esquema de prueba no contiene oficinas activas.');
        const office = offices[0];

        const accounts = [
            [`${prefix}requester_a`, 'administrativo', 'Solicitante de prueba A', `${prefix}requester-a@example.test`],
            [`${prefix}requester_b`, 'estudiante', 'Solicitante de prueba B', `${prefix}requester-b@example.test`],
            [`${prefix}technician`, 'tecnico', 'Técnico de prueba', `${prefix}technician@example.test`],
            [`${prefix}admin`, 'admin', 'Administrador de prueba', `${prefix}admin@example.test`]
        ];
        const placeholders = accounts.map(() => '?').join(', ');
        const [existing] = await connection.execute(
            `SELECT username FROM usuarios WHERE username IN (${placeholders})`,
            accounts.map(([username]) => username)
        );
        if (existing.length) {
            throw new Error('Ya existen cuentas de navegador en este esquema; no se modificarán.');
        }

        const passwordHash = await bcrypt.hash(seedPassword, 10);
        for (const [username, role, fullName, email] of accounts) {
            await connection.execute(
                `INSERT INTO usuarios
                    (username, password, rol, nombre_completo, correo_institucional, oficina_id)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [username, passwordHash, role, fullName, email, office.id]
            );
        }
        const [technician] = await connection.execute(
            'INSERT INTO tecnicos (nombre, es_jefe) VALUES (?, FALSE)',
            ['Técnico de prueba']
        );
        for (const [index, activeOffice] of offices.entries()) {
            await connection.execute(
                'INSERT INTO tecnico_oficinas (tecnico_id, oficina_id, es_responsable) VALUES (?, ?, ?)',
                [technician.insertId, activeOffice.id, index === 0]
            );
        }

        console.log(`Usuarios ficticios preparados en ${config.host}:${config.port}/${config.database}:`);
        for (const [username, role] of accounts) console.log(`- ${username} (${role})`);
        console.log(`Técnico ${technician.insertId} vinculado a ${offices.length} oficinas activas. Contraseña omitida.`);
    } finally {
        await connection.end();
    }
}

main().catch(error => {
    console.error(`No se prepararon usuarios de navegador: ${error.message}`);
    process.exitCode = 1;
});
