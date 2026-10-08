if (process.env.UTEA_TEST_DB_ALLOW_INTEGRATION === '1' && !/_test$/i.test(process.env.DB_NAME || '')) {
    throw new Error('Las pruebas de integración solo pueden conectar a una base cuyo nombre termine en _test');
}
if (process.env.UTEA_TEST_DB_ALLOW_INTEGRATION !== '1') {
    require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
}
const mysql = require('mysql2');

const connection = mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

connection.connect(err => {
    if (err) {
        console.error('Error', err);
        return;
    }
    console.log('Conectado a MySQL');
});

module.exports = connection;