const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { resolveDatabaseConfig } = require('../backend/config/databaseConfig');

const testMode = process.env.UTEA_TEST_DB_ALLOW_INTEGRATION === '1';
if (!testMode && !process.argv.includes('--no-dotenv')) {
    require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
}

async function migrate() {
    const config = resolveDatabaseConfig();

    const connection = await mysql.createConnection({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        multipleStatements: true
    });

    try {
        if (config.isTest) {
            const [[identity]] = await connection.query(
                'SELECT DATABASE() AS databaseName, @@hostname AS hostName, @@port AS serverPort'
            );
            if (identity.databaseName !== config.database || Number(identity.serverPort) !== config.port) {
                throw new Error('La identidad de la conexión no coincide con el esquema y puerto de pruebas configurados');
            }
            console.log(`Base de pruebas confirmada: ${config.host}:${config.port}/${config.database}`);
        }
        const [beforeMigrationTables] = await connection.query('SHOW TABLES');
        const existingTableNames = beforeMigrationTables.map(row => Object.values(row)[0]);
        const migrationTableExists = existingTableNames.includes('schema_migrations');
        const applicationTables = existingTableNames.filter(name => name !== 'schema_migrations');
        if (migrationTableExists) {
            const [[{ appliedCount }]] = await connection.query(
                'SELECT COUNT(*) AS appliedCount FROM schema_migrations'
            );
            if (Number(appliedCount) === 0 && applicationTables.length > 0) {
                throw new Error(
                    'La base ya contiene tablas pero no tiene historial de migraciones. ' +
                    'No se ejecutarán migraciones antiguas automáticamente; haga respaldo, verifique ' +
                    'el esquema y registre únicamente las versiones realmente aplicadas antes de reintentar.'
                );
            }
        } else if (applicationTables.length > 0) {
            throw new Error(
                'La base ya contiene tablas y no tiene schema_migrations. Haga respaldo y adopte ' +
                'explícitamente el historial verificado; el migrador no repetirá alteraciones históricas.'
            );
        }

        await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
            version VARCHAR(191) PRIMARY KEY,
            applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

        const migrationsPath = path.resolve(__dirname, '../database/migrations');
        const files = (await fs.promises.readdir(migrationsPath))
            .filter(file => /^\d+_[a-z0-9_-]+\.sql$/i.test(file))
            .sort();
        const [appliedRows] = await connection.query('SELECT version FROM schema_migrations');
        const appliedVersions = new Set(appliedRows.map(row => row.version));
        const firstPendingIndex = files.findIndex(file => !appliedVersions.has(file));
        if (firstPendingIndex !== -1 && files.slice(firstPendingIndex + 1).some(file => appliedVersions.has(file))) {
            throw new Error(
                'El historial de migraciones tiene versiones posteriores aplicadas con versiones anteriores pendientes. ' +
                'Revise schema_migrations manualmente; no se continuará fuera de orden.'
            );
        }

        for (const [index, file] of files.entries()) {
            if (appliedVersions.has(file)) continue;

            const sql = await fs.promises.readFile(path.join(migrationsPath, file), 'utf8');
            if (file === '023_idempotencia_y_relaciones_cuentas.sql' &&
                existingTableNames.includes('tickets') &&
                existingTableNames.includes('incidencias_cuentas')) {
                const [[{ orphanCount }]] = await connection.query(
                    `SELECT COUNT(*) AS orphanCount
                     FROM incidencias_cuentas ic
                     LEFT JOIN tickets t ON t.id = ic.ticket_id
                     WHERE ic.ticket_id IS NOT NULL AND t.id IS NULL`
                );
                if (Number(orphanCount) > 0) {
                    throw new Error(
                        `La migración ${file} requiere corregir ${orphanCount} referencias ticket_id huérfanas ` +
                        'en la tabla de prueba/copia antes de añadir la clave foránea.'
                    );
                }
            }
            await connection.query(sql);
            await connection.execute('INSERT INTO schema_migrations (version) VALUES (?)', [file]);
            appliedVersions.add(file);
            console.log(`Migracion aplicada: ${file}`);
        }
    } finally {
        await connection.end();
    }
}

if (require.main === module) {
    migrate().catch(error => {
        console.error(`Error ejecutando migraciones: ${error.message}`);
        process.exitCode = 1;
    });
}

module.exports = migrate;