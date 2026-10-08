const express = require('express');
const router = express.Router();
const db = require('../db');
const verificarToken = require('../middleware/authMiddleware');
const { verificarRol } = require('../middleware/roleMiddleware');

//obtener tecnicos
router.get('/', verificarToken, verificarRol('admin', 'superadmin'), (req, res) => {
    db.query('SELECT id, nombre, es_jefe FROM tecnicos', (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

module.exports = router;
