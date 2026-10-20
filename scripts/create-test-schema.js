const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');

function readArguments(args) {
    const values = {};
    for (let index = 0; index < args.length; index += 1) {
        const key = args[index];
        if (!key.startsWith('--') || !args[index + 1]) {
            throw new Error('Argumentos esperados: --host --port --data-dir --schema --env-output --upload-root --app-port');
        }
        values[key.slice(2)] = args[++index];
    }
    for (const required of ['host', 'port', 'data-dir', 'schema', 'env-output', 'upload-root', 'app-port']) {
        if (!values[required]) throw new Error(`Falta --${required}`);
    }
    if (!/^127\.0\.0\.1$|^localhost$/.test(values.host)) {
        throw new Error('El servidor temporal debe enlazarse únicamente a localhost.');
    }
    if (!/^[a-z0-9_]+_test$/i.test(values.schema)) {
        throw new Error('El nombre del esquema debe terminar en _test y usar solo letras, números y guiones bajos.');
    }
    return values;
}

async function main() {
    const args = readArguments(process.argv.slice(2));
    const dataDirectory = path.resolve(args['data-dir']).replace(/[\\/]+$/, '');
    const envFile = path.resolve(args['env-output']);
    const uploadRoot = path.resolve(args['upload-root']);
    if (fs.existsSync(envFile)) throw new Error('El archivo de entorno ya existe; no se sobrescribirá.');
    if (!fs.existsSync(dataDirectory)) throw new Error('El directorio MySQL esperado no existe.');

    const connection = await mysql.createConnection({
        host: args.host,
        port: Number(args.port),
        user: 'root',
        password: '',
        connectTimeout: 5000,
        multipleStatements: false
    });
    try {
        const [[instance]] = await connection.query(
            'SELECT @@hostname AS hostName, @@port AS serverPort, @@datadir AS dataDirectory'
        );
        const instanceDirectory = path.resolve(instance.dataDirectory).replace(/[\\/]+$/, '');
        if (Number(instance.serverPort) !== Number(args.port) ||
            instanceDirectory.toLowerCase() !== dataDirectory.toLowerCase()) {
            throw new Error('El servicio contactado no coincide con la instancia temporal esperada.');
        }
        const [existing] = await connection.query(
            'SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?',
            [args.schema]
        );
        if (existing.length) throw new Error('El esquema ya existe; no se reutilizará ni alterará.');

        const appPassword = crypto.randomBytes(32).toString('hex');
        const jwtSecret = crypto.randomBytes(48).toString('hex');
        const schema = `\`${args.schema}\``;
        await connection.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        await connection.query("CREATE USER 'utea_test_runner'@'127.0.0.1' IDENTIFIED BY ?", [appPassword]);
        await connection.query(`GRANT ALL PRIVILEGES ON ${schema}.* TO 'utea_test_runner'@'127.0.0.1'`);

        await fs.promises.mkdir(path.dirname(envFile), { recursive: true });
        await fs.promises.mkdir(uploadRoot, { recursive: true });
        const contents = [
            `UTEA_TEST_DB_HOST=${args.host}`,
            `UTEA_TEST_DB_PORT=${Number(args.port)}`,
            'UTEA_TEST_DB_USER=utea_test_runner',
            `UTEA_TEST_DB_PASSWORD=${appPassword}`,
            `UTEA_TEST_DB_NAME=${args.schema}`,
            'UTEA_TEST_DB_ALLOW_INTEGRATION=1',
            `UTEA_TEST_APP_PORT=${Number(args['app-port'])}`,
            `UTEA_UPLOAD_ROOT=${uploadRoot.replace(/\\/g, '/')}`,
            `JWT_SECRET=${jwtSecret}`,
            'ADMIN_USERNAME=',
            'ADMIN_PASSWORD=',
            ''
        ].join('\n');
        await fs.promises.writeFile(envFile, contents, { flag: 'wx', mode: 0o600 });
        console.log(`Esquema de prueba creado y verificado: ${args.host}:${Number(args.port)}/${args.schema}`);
        console.log(`Archivo de entorno local escrito; credenciales omitidas: ${envFile}`);
    } finally {
        await connection.end();
    }
}

main().catch(error => {
    console.error(`No se preparó el esquema de prueba: ${error.message}`);
    process.exitCode = 1;
});
