const ACCOUNT_STAFF_ROLES = new Set(['admin', 'superadmin', 'tecnico', 'adminti']);
const TICKET_LIST_STAFF_ROLES = new Set(['admin', 'superadmin', 'tecnico']);
const TICKET_ATTACHMENT_ROLES = new Set(['admin']);
const TICKET_SURVEY_ROLES = new Set(['admin', 'superadmin']);
const TICKET_ASSIGNMENT_ROLES = new Set(['admin', 'superadmin', 'adminti']);
const ADMIN_PANEL_ROLES = new Set(['admin']);

function hasRole(user, roles) {
    return Boolean(user && roles.has(String(user.rol || '').toLowerCase()));
}

function canAccessOwnedResource(user, ownerId, roles) {
    return hasRole(user, roles) || Number(ownerId) === Number(user?.id);
}

function canListAllTickets(user) {
    return hasRole(user, TICKET_LIST_STAFF_ROLES);
}

function canViewReports(user) {
    return hasRole(user, TICKET_LIST_STAFF_ROLES);
}

function canManageAdmin(user) {
    return hasRole(user, ADMIN_PANEL_ROLES);
}

function canManageAccounts(user) {
    return hasRole(user, ACCOUNT_STAFF_ROLES);
}

function canManageAssignments(user) {
    return hasRole(user, TICKET_ASSIGNMENT_ROLES);
}

function isAccountStaff(user) {
    return hasRole(user, ACCOUNT_STAFF_ROLES);
}

module.exports = {
    ACCOUNT_STAFF_ROLES,
    TICKET_LIST_STAFF_ROLES,
    TICKET_ATTACHMENT_ROLES,
    TICKET_SURVEY_ROLES,
    TICKET_ASSIGNMENT_ROLES,
    ADMIN_PANEL_ROLES,
    canAccessOwnedResource,
    canListAllTickets,
    canViewReports,
    canManageAdmin,
    canManageAccounts,
    canManageAssignments,
    isAccountStaff
};
