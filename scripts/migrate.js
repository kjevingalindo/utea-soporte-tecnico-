const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function migrate() {
    const required = ['DB_HOST', 'DB_USER', 'DB_NAME'];
    const missing = required.filter(name => !process.env[name]);
    if (missing.length) {
        throw new Error(`Faltan variables de entorno: ${missing.join(', ')}`);
    }

    const port = Number(process.env.DB_PORT || 3306);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('DB_PORT debe ser un puerto valido');
    }

    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME,
        multipleStatements: true
    });

    try {
        await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
            version VARCHAR(191) PRIMARY KEY,
            applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

        const migrationsPath = path.resolve(__dirname, '../database/migrations');
        const files = (await fs.promises.readdir(migrationsPath))
            .filter(file => /^\d+_[a-z0-9_-]+\.sql$/i.test(file))
            .sort();

        for (const file of files) {
            const [applied] = await connection.execute(
                'SELECT version FROM schema_migrations WHERE version = ?',
                [file]
            );
            if (applied.length) continue;

            const sql = await fs.promises.readFile(path.join(migrationsPath, file), 'utf8');
            await connection.query(sql);
            await connection.execute('INSERT INTO schema_migrations (version) VALUES (?)', [file]);
            console.log(`Migracion aplicada: ${file}`);
        }
    } finally {
        await connection.end();
    }
}

migrate().catch(error => {
    console.error(`Error ejecutando migraciones: ${error.message}`);
    process.exitCode = 1;
});