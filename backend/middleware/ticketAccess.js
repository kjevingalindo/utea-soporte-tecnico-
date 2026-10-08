const db = require('../db');
const { canAccessOwnedResource } = require('../utils/accessControl');

function requireTicketAccess({ parameter = 'ticketId', source = 'params', roles = new Set(['admin']) } = {}) {
    return (req, res, next) => {
        const rawId = source === 'body' ? req.body?.[parameter] : req[source]?.[parameter];
        const ticketId = Number(rawId);
        if (!Number.isSafeInteger(ticketId) || ticketId < 1) {
            return res.status(400).json({ error: 'El identificador del ticket no es válido' });
        }

        db.query('SELECT id, user_id FROM tickets WHERE id = ?', [ticketId], (err, rows) => {
            if (err) return res.status(500).json({ error: 'No se pudo validar el ticket' });
            if (!rows.length) return res.status(404).json({ error: 'Ticket no encontrado' });
            if (!canAccessOwnedResource(req.user, rows[0].user_id, roles)) {
                return res.status(403).json({ error: 'No tienes permisos para acceder a este ticket' });
            }

            req.ticket = rows[0];
            next();
        });
    };
}

module.exports = requireTicketAccess;
