const express = require('express');
const router = express.Router();
const db = require('../db');
const verificarToken = require('../middleware/authMiddleware');
const { verificarRol } = require('../middleware/roleMiddleware');

//obtener tecnicos
router.get('/', verificarToken, verificarRol('admin', 'superadmin'), (req, res) => {
    const { oficina_id } = req.query;
    if (oficina_id) {
        db.query(`SELECT t.id, t.nombre, t.es_jefe, ot.es_responsable
                  FROM tecnico_oficinas ot
                  INNER JOIN tecnicos t ON t.id = ot.tecnico_id
                  WHERE ot.oficina_id = ?
                  ORDER BY ot.es_responsable DESC, t.nombre`, [Number(oficina_id)], (err, results) => {
            if (err) return res.status(500).json(err);
            res.json(results);
        });
    } else {
        db.query('SELECT id, nombre, es_jefe FROM tecnicos ORDER BY es_jefe DESC, nombre', (err, results) => {
            if (err) return res.status(500).json(err);
            res.json(results);
        });
    }
});

module.exports = router;
