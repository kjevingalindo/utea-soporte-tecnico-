const { executeQuery } = require('./baseRepository');

async function findExistingTicketByIdempotency(userId, key) {
    return executeQuery(
        'SELECT id, idempotency_hash FROM tickets WHERE user_id = ? AND idempotency_key = ? LIMIT 1',
        [userId, key]
    );
}

async function saveTicket(ticketPayload) {
    const fields = [
        'titulo', 'descripcion', 'estado', 'prioridad', 'tecnico_id', 'user_id', 'oficina_id',
        'categoria_id', 'categoria_usuario', 'carrera', 'bloque', 'ambiente', 'aula',
        'asignatura_area', 'ubicacion', 'solicitante_nombre', 'codigo_universitario_dni',
        'tipo_solicitante', 'impacto', 'urgencia', 'sla_response_due_at', 'sla_resolution_due_at',
        'idempotency_key', 'idempotency_hash'
    ];
    const values = fields.map(field => ticketPayload[field]);
    const [result] = await executeQuery(
        `INSERT INTO tickets (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`,
        values
    );
    return result.insertId;
}

module.exports = {
    findExistingTicketByIdempotency,
    saveTicket
};
