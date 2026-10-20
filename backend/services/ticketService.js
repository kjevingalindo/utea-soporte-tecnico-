const { findExistingTicketByIdempotency, saveTicket } = require('../repositories/ticketRepository');
const { fingerprint } = require('../utils/idempotency');

async function findIdempotentTicket(userId, key, requestPayload) {
    const existing = await findExistingTicketByIdempotency(userId, key);
    if (existing.length) {
        if (existing[0].idempotency_hash !== fingerprint(requestPayload)) {
            const error = new Error('La clave de reintento ya se usó con datos distintos.');
            error.status = 409;
            throw error;
        }
        return existing[0].id;
    }
    return null;
}

async function createTicket(ticketPayload, requestPayload = ticketPayload, options = {}) {
    const normalized = {
        ...ticketPayload,
        idempotency_hash: fingerprint(requestPayload)
    };

    if (!options.skipLookup) {
        const existingTicketId = await findIdempotentTicket(
            normalized.user_id,
            normalized.idempotency_key,
            requestPayload
        );
        if (existingTicketId) return { id: existingTicketId, replayed: true };
    }

    try {
        const ticketId = await saveTicket(normalized);
        return { id: ticketId, replayed: false };
    } catch (error) {
        if (error.code !== 'ER_DUP_ENTRY') throw error;
        const racedRequest = await findExistingTicketByIdempotency(normalized.user_id, normalized.idempotency_key);
        if (!racedRequest.length) throw error;
        if (racedRequest[0].idempotency_hash !== normalized.idempotency_hash) {
            const conflict = new Error('La clave de reintento ya se usó con datos distintos.');
            conflict.status = 409;
            throw conflict;
        }
        return { id: racedRequest[0].id, replayed: true };
    }
}

module.exports = {
    createTicket,
    findIdempotentTicket
};
