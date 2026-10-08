const { findExistingTicketByIdempotency, saveTicket } = require('../repositories/ticketRepository');
const { fingerprint } = require('../utils/idempotency');

async function createTicket(ticketPayload) {
    const normalized = {
        ...ticketPayload,
        idempotency_hash: fingerprint(ticketPayload)
    };

    const existing = await findExistingTicketByIdempotency(normalized.user_id, normalized.idempotency_key);
    if (existing.length) {
        if (existing[0].idempotency_hash !== normalized.idempotency_hash) {
            const error = new Error('La clave de reintento ya se usó con datos distintos.');
            error.status = 409;
            throw error;
        }
        return { id: existing[0].id, replayed: true };
    }

    const ticketId = await saveTicket(normalized);
    return { id: ticketId, replayed: false };
}

module.exports = {
    createTicket
};
