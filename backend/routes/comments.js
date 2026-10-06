const express = require('express');
const router = express.Router();
const db = require('../db');
const verificarToken = require('../middleware/authMiddleware');
const { crearNotificacion } = require('./notifications');
const { registrarHistorial } = require('./historial');

// Obtener comentarios de un ticket
router.get('/:ticketId', verificarToken, (req, res) => {
    const { ticketId } = req.params;
    
    db.query(`SELECT comentarios.*, usuarios.username 
               FROM comentarios 
               LEFT JOIN usuarios ON comentarios.user_id = usuarios.id 
                             INNER JOIN tickets ON comentarios.ticket_id = tickets.id
                             WHERE comentarios.ticket_id = ?
                                 AND (tickets.user_id = ? OR ? = 'admin')
                             ORDER BY comentarios.fecha ASC`, [ticketId, req.user.id, req.user.rol], (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

// Agregar comentario
router.post('/', verificarToken, (req, res) => {
    const { ticket_id, comentario } = req.body || {};
    
    if (!ticket_id || typeof comentario !== 'string' || !comentario.trim()) {
        return res.status(400).json({ error: 'Ticket y comentario son obligatorios' });
    }
    
    db.query(`INSERT INTO comentarios (ticket_id, user_id, comentario)
              SELECT tickets.id, ?, ? FROM tickets
              WHERE tickets.id = ? AND (tickets.user_id = ? OR ? = 'admin')`,
        [req.user.id, comentario, ticket_id, req.user.id, req.user.rol], (err, result) => {
            if (err) return res.status(500).json(err);
            if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'Ticket no encontrado' });
            }

            const continuarDespuesSla = () => {
                db.query('SELECT user_id, titulo FROM tickets WHERE id = ?', [ticket_id], (err2, ticketData) => {
                    if (!err2 && ticketData && ticketData.length > 0) {
                        const ownerId = ticketData[0].user_id;
                        const ticketTitulo = ticketData[0].titulo;

                        registrarHistorial(
                            ticket_id,
                            req.user.id,
                            'comentario',
                            `${req.user.username} agregó un comentario al ticket`,
                            'comentario',
                            null,
                            comentario.trim()
                        );

                        if (req.user.rol === 'admin') {
                            if (ownerId && ownerId !== req.user.id) {
                                crearNotificacion(
                                    ownerId,
                                    'nuevo_comentario',
                                    `${req.user.username} comentó en tu ticket "${ticketTitulo}"`,
                                    parseInt(ticket_id)
                                );
                            }
                        } else {
                            db.query("SELECT id FROM usuarios WHERE rol = 'admin'", (err3, admins) => {
                                if (!err3 && admins) {
                                    admins.forEach(admin => {
                                        crearNotificacion(
                                            admin.id,
                                            'nuevo_comentario',
                                            `${req.user.username} comentó en ticket #${ticket_id}: "${ticketTitulo}"`,
                                            parseInt(ticket_id)
                                        );
                                    });
                                }
                            });
                        }
                    }

                    res.json({ mensaje: 'Comentario agregado correctamente' });
                });
            };

            if (req.user.rol === 'admin') {
                db.query(
                    'UPDATE tickets SET sla_first_response_at = COALESCE(sla_first_response_at, ?) WHERE id = ?',
                    [Date.now(), ticket_id],
                    (slaErr) => {
                        if (slaErr) console.error('Error al registrar primera respuesta SLA:', slaErr.message);
                        continuarDespuesSla();
                    }
                );
                return;
            }

            continuarDespuesSla();
        });
});

module.exports = router;

