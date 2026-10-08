const db = require('../db');

function withPool() {
    return db.promise ? db.promise() : db;
}

async function executeQuery(sql, params = []) {
    const pool = withPool();
    const [rows] = await pool.execute(sql, params);
    return rows;
}

module.exports = {
    executeQuery,
    withPool
};
