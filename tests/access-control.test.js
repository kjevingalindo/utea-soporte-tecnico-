const test = require('node:test');
const assert = require('node:assert/strict');
const {
    canAccessOwnedResource,
    canListAllTickets,
    isAccountStaff,
    TICKET_ATTACHMENT_ROLES,
    TICKET_SURVEY_ROLES
} = require('../backend/utils/accessControl');

test('ticket owner can access own resource, other users cannot', () => {
    assert.equal(canAccessOwnedResource({ id: 7, rol: 'usuario' }, 7, TICKET_ATTACHMENT_ROLES), true);
    assert.equal(canAccessOwnedResource({ id: 7, rol: 'usuario' }, 8, TICKET_ATTACHMENT_ROLES), false);
});

test('ticket resource roles preserve endpoint-specific staff access', () => {
    assert.equal(canAccessOwnedResource({ id: 1, rol: 'admin' }, 2, TICKET_ATTACHMENT_ROLES), true);
    assert.equal(canAccessOwnedResource({ id: 1, rol: 'tecnico' }, 2, TICKET_ATTACHMENT_ROLES), false);
    assert.equal(canAccessOwnedResource({ id: 1, rol: 'superadmin' }, 2, TICKET_SURVEY_ROLES), true);
});

test('ticket visibility and account staff roles are distinct', () => {
    assert.equal(canListAllTickets({ id: 1, rol: 'tecnico' }), true);
    assert.equal(canListAllTickets({ id: 1, rol: 'adminti' }), false);
    assert.equal(canListAllTickets({ id: 1, rol: 'administrativo' }), false);
    assert.equal(isAccountStaff({ id: 1, rol: 'adminti' }), true);
    assert.equal(isAccountStaff({ id: 1, rol: 'administrativo' }), false);
    assert.equal(isAccountStaff({ id: 1, rol: 'estudiante' }), false);
});
