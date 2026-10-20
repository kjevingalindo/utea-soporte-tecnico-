const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');
const { applyTestDatabaseEnvironment } = require('../backend/config/databaseConfig');

function parseArguments(args) {
    const [mode, ...rest] = args;
    let envFile = '.env.test.local';
    for (let index = 0; index < rest.length; index += 1) {
        if (rest[index] === '--test-config') envFile = rest[++index];
        else throw new Error(`Argumento no reconocido: ${rest[index]}`);
    }
    if (!['migrate', 'integration', 'start'].includes(mode)) {
        throw new Error('Uso: node scripts/run-test-env.js <migrate|integration|start> [--test-config <archivo>]');
    }
    return { mode, envFile: path.resolve(envFile) };
}

function loadEnvironment(envFile) {
    if (!fs.existsSync(envFile)) throw new Error('El archivo de entorno de pruebas no existe.');
    const env = dotenv.parse(fs.readFileSync(envFile));
    env.UTEA_TEST_DB_ALLOW_INTEGRATION = '1';
    applyTestDatabaseEnvironment(env);
    if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
        throw new Error('JWT_SECRET de pruebas debe tener al menos 32 caracteres.');
    }
    if (!env.UTEA_UPLOAD_ROOT || !path.isAbsolute(env.UTEA_UPLOAD_ROOT)) {
        throw new Error('UTEA_UPLOAD_ROOT debe indicar un directorio absoluto exclusivo de pruebas.');
    }
    env.UTEA_UPLOAD_ROOT = path.resolve(env.UTEA_UPLOAD_ROOT);
    env.PORT = String(env.UTEA_TEST_APP_PORT || '3100');
    for (const key of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_SECURE']) delete env[key];
    env.ADMIN_USERNAME = '';
    env.ADMIN_PASSWORD = '';
    return env;
}

async function ensureTestMysqlRunning(config) {
    const net = require('net');
    const isPortOpen = () => new Promise(resolve => {
        const socket = new net.Socket();
        socket.setTimeout(1000);
        socket.once('connect', () => { socket.destroy(); resolve(true); });
        socket.once('timeout', () => { socket.destroy(); resolve(false); });
        socket.once('error', () => { socket.destroy(); resolve(false); });
        socket.connect(config.port, config.host);
    });

    if (await isPortOpen()) return;

    const dataDir = path.resolve(process.env.TEMP || 'C:\\Windows\\Temp', 'utea-support-test-mysql-data');
    const mysqlBin = 'C:\\Program Files\\MySQL\\MySQL Server 9.4\\bin\\mysqld.exe';
    if (!fs.existsSync(mysqlBin) || !fs.existsSync(dataDir)) return;

    console.log(`Iniciando instancia aislada de MySQL en puerto ${config.port}...`);
    const proc = spawn(mysqlBin, [
        '--no-defaults',
        `--datadir=${dataDir}`,
        `--port=${config.port}`,
        '--bind-address=127.0.0.1'
    ], { stdio: 'ignore', detached: true, windowsHide: true });
    proc.unref();

    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 500));
        if (await isPortOpen()) {
            console.log(`Instancia aislada de MySQL lista en puerto ${config.port}`);
            return;
        }
    }
}

async function verifyTarget(env) {
    const config = applyTestDatabaseEnvironment(env);
    await ensureTestMysqlRunning(config);
    const connection = await mysql.createConnection({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        connectTimeout: 5000
    });
    try {
        const [[identity]] = await connection.query(
            'SELECT DATABASE() AS databaseName, @@hostname AS hostName, @@port AS serverPort'
        );
        if (identity.databaseName !== config.database || Number(identity.serverPort) !== config.port) {
            throw new Error('El servidor MySQL respondió con un esquema o puerto distinto al configurado.');
        }
        console.log(`Entorno confirmado: ${config.host}:${config.port}/${config.database}`);
    } finally {
        await connection.end();
    }
}

function run(command, args, env) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { cwd: path.resolve(__dirname, '..'), env, stdio: 'inherit', shell: false });
        child.once('error', reject);
        child.once('exit', code => code === 0 ? resolve() : reject(new Error(`El proceso terminó con código ${code}`)));
    });
}

async function main() {
    const { mode, envFile } = parseArguments(process.argv.slice(2));
    const env = loadEnvironment(envFile);
    await verifyTarget(env);
    const node = process.execPath;
    if (mode === 'migrate') {
        await run(node, ['scripts/migrate.js', '--no-dotenv'], env);
    } else if (mode === 'integration') {
        await run(node, ['scripts/migrate.js', '--no-dotenv'], env);
        await run(node, ['scripts/migrate.js', '--no-dotenv'], env);
        await run(node, ['--test', 'tests/integration/accounts.integration.test.js', 'tests/integration/ticket-routes.integration.test.js'], env);
    } else {
        await run(node, ['backend/server.js'], env);
    }
}

main().catch(error => {
    console.error(`No se ejecutó el comando de pruebas: ${error.message}`);
    process.exitCode = 1;
});
