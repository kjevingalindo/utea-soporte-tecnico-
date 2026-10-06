const db = require('../db');

function registrarHistorial(ticketId, usuarioId, accion, descripcion, campo = null, valorAnterior = null, valorNuevo = null) {
    if (!ticketId || !accion) return;

    db.query(
        `INSERT INTO ticket_historial
            (ticket_id, usuario_id, accion, campo, valor_anterior, valor_nuevo, descripcion)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            Number(ticketId),
            usuarioId || null,
            accion,
            campo || null,
            valorAnterior === undefined || valorAnterior === null ? null : String(valorAnterior),
            valorNuevo === undefined || valorNuevo === null ? null : String(valorNuevo),
            descripcion || accion
        ],
        (err) => {
            if (err) {
                console.error('Error al registrar historial del ticket:', err.message);
            }
        }
    );
}

module.exports = { registrarHistorial };