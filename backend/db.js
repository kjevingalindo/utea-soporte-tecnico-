if (process.env.UTEA_TEST_DB_ALLOW_INTEGRATION !== '1') {
    require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
}
const mysql = require('mysql2');
const { resolveDatabaseConfig } = require('./config/databaseConfig');
const databaseConfig = resolveDatabaseConfig();

const connection = mysql.createConnection({
    host: databaseConfig.host,
    port: databaseConfig.port,
    user: databaseConfig.user,
    password: databaseConfig.password,
    database: databaseConfig.database
});

connection.connect(err => {
    if (err) {
        console.error('Error', err);
        return;
    }
    console.log('Conectado a MySQL');
});

module.exports = connection;