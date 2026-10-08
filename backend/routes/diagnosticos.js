const express = require('express');
const router = express.Router();
const db = require('../db');
const verificarToken = require('../middleware/authMiddleware');
const { verificarRol } = require('../middleware/roleMiddleware');
const { registrarHistorial } = require('./historial');
const requireTicketAccess = require('../middleware/ticketAccess');
const { TICKET_ATTACHMENT_ROLES } = require('../utils/accessControl');

// Endpoint público/autenticado para listar auto-diagnósticos de la base de conocimiento UTEA
router.get('/auto', verificarToken, (req, res) => {
    db.query('SELECT * FROM auto_diagnosticos WHERE activo = TRUE ORDER BY titulo ASC', (err, rows) => {
        if (err) return res.status(500).json({ error: 'No se pudo cargar la base de autodiagnósticos' });
        res.json(rows);
    });
});

// Obtener auto-diagnóstico por código de categoría o id de categoría
router.get('/auto/categoria/:codigo', verificarToken, (req, res) => {
    const { codigo } = req.params;
    db.query(
        `SELECT ad.* FROM auto_diagnosticos ad
         INNER JOIN categorias c ON c.codigo = ad.categoria_codigo OR c.id = ?
         WHERE (ad.categoria_codigo = ? OR c.id = ?) AND ad.activo = TRUE
         LIMIT 1`,
        [codigo, codigo, codigo],
        (err, rows) => {
            if (err) return res.status(500).json({ error: 'No se pudo obtener el diagnóstico' });
            res.json(rows[0] || null);
        }
    );
});

router.get('/:ticketId', verificarToken, requireTicketAccess({ roles: TICKET_ATTACHMENT_ROLES }), (req, res) => {
        db.query(
            `SELECT d.*, u.username AS tecnico_nombre
             FROM ticket_diagnosticos d
             LEFT JOIN usuarios u ON u.id = d.usuario_id
             WHERE d.ticket_id = ?`,
            [req.params.ticketId],
            (err, rows) => {
                if (err) return res.status(500).json({ error: 'No se pudo cargar el diagnóstico' });
                res.json(rows[0] || null);
            }
        );
});

router.put('/:ticketId', verificarToken, verificarRol('admin'), (req, res) => {
    const ticketId = Number(req.params.ticketId);
    const { causa_probable, pruebas_realizadas, solucion_aplicada, recomendaciones } = req.body || {};
    const values = { causa_probable, pruebas_realizadas, solucion_aplicada, recomendaciones };

    for (const [field, value] of Object.entries(values)) {
        if (value !== undefined && value !== null && typeof value !== 'string') {
            return res.status(400).json({ error: 'Los campos del diagnóstico deben ser texto' });
        }
        if (typeof value === 'string' && value.length > 3000) {
            return res.status(400).json({ error: 'El diagnóstico no puede superar 3000 caracteres por campo' });
        }
    }

    db.query('SELECT id FROM tickets WHERE id = ?', [ticketId], (ticketErr, tickets) => {
        if (ticketErr) return res.status(500).json({ error: 'No se pudo validar el ticket' });
        if (!tickets.length) return res.status(404).json({ error: 'Ticket no encontrado' });

        db.query(
            `INSERT INTO ticket_diagnosticos
                (ticket_id, usuario_id, causa_probable, pruebas_realizadas, solucion_aplicada, recomendaciones)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                usuario_id = VALUES(usuario_id),
                causa_probable = VALUES(causa_probable),
                pruebas_realizadas = VALUES(pruebas_realizadas),
                solucion_aplicada = VALUES(solucion_aplicada),
                recomendaciones = VALUES(recomendaciones),
                updated_at = CURRENT_TIMESTAMP`,
            [
                ticketId,
                req.user.id,
                causa_probable?.trim() || null,
                pruebas_realizadas?.trim() || null,
                solucion_aplicada?.trim() || null,
                recomendaciones?.trim() || null
            ],
            (err) => {
                if (err) return res.status(500).json({ error: 'No se pudo guardar el diagnóstico' });
                registrarHistorial(ticketId, req.user.id, 'diagnostico', `${req.user.username} actualizó el diagnóstico técnico`);
                res.json({ mensaje: 'Diagnóstico técnico guardado correctamente' });
            }
        );
    });
});

module.exports = router;