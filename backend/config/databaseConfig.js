const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function resolveDatabaseConfig(env = process.env) {
    const isTest = env.UTEA_TEST_DB_ALLOW_INTEGRATION === '1';
    const prefix = isTest ? 'UTEA_TEST_DB_' : 'DB_';
    const host = env[`${prefix}HOST`];
    const portValue = env[`${prefix}PORT`];
    const user = env[`${prefix}USER`];
    const password = env[`${prefix}PASSWORD`];
    const database = env[`${prefix}NAME`];
    const required = { host, port: portValue, user, password, database };
    const missing = Object.entries(required)
        .filter(([key, value]) => value === undefined || (isTest && key === 'password' && value === ''))
        .map(([key]) => key.toUpperCase());
    if (missing.length) {
        throw new Error(`Falta configuración explícita de base de datos: ${missing.join(', ')}`);
    }

    const port = Number(portValue);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('El puerto de la base de datos no es válido');
    }
    if (isTest && !/_test$/i.test(database)) {
        throw new Error('El esquema de pruebas debe terminar en _test');
    }
    if (isTest && !LOCAL_HOSTS.has(String(host).toLowerCase())) {
        throw new Error('La base de integración debe estar disponible únicamente en localhost');
    }

    return { host, port, user, password, database, isTest };
}

function applyTestDatabaseEnvironment(env = process.env) {
    if (env.UTEA_TEST_DB_ALLOW_INTEGRATION !== '1') {
        throw new Error('Las pruebas de integración requieren UTEA_TEST_DB_ALLOW_INTEGRATION=1');
    }
    for (const name of ['HOST', 'PORT', 'USER', 'PASSWORD', 'NAME']) {
        const source = `UTEA_TEST_DB_${name}`;
        if (env[source] === undefined || env[source] === '') {
            throw new Error(`Falta la variable de prueba ${source}`);
        }
        env[`DB_${name}`] = env[source];
    }
    const config = resolveDatabaseConfig(env);
    if (!env.JWT_SECRET) throw new Error('Falta JWT_SECRET exclusivo para pruebas');
    return config;
}

async function ensureTestMysqlRunning(config) {
    if (!config || !config.isTest) return;
    const net = require('net');
    const path = require('path');
    const fs = require('fs');
    const { spawn } = require('child_process');

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

module.exports = { resolveDatabaseConfig, applyTestDatabaseEnvironment, ensureTestMysqlRunning };
