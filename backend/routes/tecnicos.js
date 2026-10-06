const express = require('express');
const router = express.Router();
const db = require('../db');

//obtener tecnicos
router.get('/', (req, res) => {
    db.query('SELECT * FROM tecnicos', (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

module.exports = router;

