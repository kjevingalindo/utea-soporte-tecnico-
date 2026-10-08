const TICKET_STATES = Object.freeze([
    'Creado',
    'Clasificado',
    'Asignado',
    'En proceso',
    'Esperando usuario',
    'Solucionado',
    'Cerrado'
]);

const ALLOWED_TRANSITIONS = Object.freeze({
    'Creado': new Set(['Clasificado', 'Asignado']),
    'Clasificado': new Set(['Asignado']),
    'Asignado': new Set(['Clasificado', 'En proceso']),
    'En proceso': new Set(['Asignado', 'Esperando usuario', 'Solucionado']),
    'Esperando usuario': new Set(['En proceso', 'Solucionado']),
    'Solucionado': new Set(['En proceso', 'Cerrado']),
    'Cerrado': new Set(['En proceso'])
});

function isValidTicketState(value) {
    return TICKET_STATES.includes(value);
}

function canTransitionTicket(current, next) {
    return current === next || Boolean(ALLOWED_TRANSITIONS[current]?.has(next));
}

module.exports = { TICKET_STATES, isValidTicketState, canTransitionTicket };
