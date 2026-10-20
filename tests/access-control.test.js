const test = require('node:test');
const assert = require('node:assert/strict');
const {
    canAccessOwnedResource,
    canListAllTickets,
    canViewReports,
    canManageAdmin,
    canAccessCalendar,
    canManageAssignments,
    canManageAccounts,
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
    assert.equal(canAccessOwnedResource({ id: 1, rol: 'tecnico' }, 2, TICKET_ATTACHMENT_ROLES), true);
    assert.equal(canAccessOwnedResource({ id: 1, rol: 'superadmin' }, 2, TICKET_SURVEY_ROLES), true);
});

test('ticket visibility and account staff roles are distinct', () => {
    assert.equal(canListAllTickets({ id: 1, rol: 'tecnico' }), true);
    assert.equal(canListAllTickets({ id: 1, rol: 'adminti' }), false);
    assert.equal(canListAllTickets({ id: 1, rol: 'administrativo' }), false);
    assert.equal(isAccountStaff({ id: 1, rol: 'adminti' }), false);
    assert.equal(isAccountStaff({ id: 1, rol: 'administrativo' }), false);
    assert.equal(isAccountStaff({ id: 1, rol: 'estudiante' }), false);
    assert.equal(canManageAssignments({ id: 1, rol: 'adminti' }), false);
});

test('administrative permissions are separate from ticket listing and applicant type', () => {
    for (const rol of ['admin', 'superadmin']) {
        const user = { id: 1, rol };
        assert.equal(canListAllTickets(user), true);
        assert.equal(canViewReports(user), true);
        assert.equal(canManageAdmin(user), true);
        assert.equal(canAccessCalendar(user), true);
        assert.equal(canManageAssignments(user), true);
    }
    const technician = { id: 2, rol: 'tecnico' };
    assert.equal(canListAllTickets(technician), true);
    assert.equal(canViewReports(technician), false);
    assert.equal(canManageAdmin(technician), false);
    assert.equal(canAccessCalendar(technician), false);
    assert.equal(canManageAccounts(technician), true);
    assert.equal(canManageAssignments(technician), false);
    assert.equal(canViewReports({ id: 3, rol: 'administrativo' }), false);
    assert.equal(canAccessCalendar({ id: 3, rol: 'administrativo' }), false);
});
