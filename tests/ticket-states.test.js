const test = require('node:test');
const assert = require('node:assert/strict');
const { TICKET_STATES, isValidTicketState, canTransitionTicket } = require('../backend/utils/ticketStates');

test('recognizes the seven persisted ticket states and rejects unknown values', () => {
    assert.equal(TICKET_STATES.length, 7);
    assert.equal(isValidTicketState('En proceso'), true);
    assert.equal(isValidTicketState('inventado'), false);
});

test('allows forward processing, wait, resolution, closure, and explicit reopening', () => {
    assert.equal(canTransitionTicket('Creado', 'Clasificado'), true);
    assert.equal(canTransitionTicket('Clasificado', 'Asignado'), true);
    assert.equal(canTransitionTicket('Asignado', 'En proceso'), true);
    assert.equal(canTransitionTicket('En proceso', 'Esperando usuario'), true);
    assert.equal(canTransitionTicket('Esperando usuario', 'Solucionado'), true);
    assert.equal(canTransitionTicket('Solucionado', 'Cerrado'), true);
    assert.equal(canTransitionTicket('Cerrado', 'En proceso'), true);
    assert.equal(canTransitionTicket('Cerrado', 'Asignado'), false);
});
