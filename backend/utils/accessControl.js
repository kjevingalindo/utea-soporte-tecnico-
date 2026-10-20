const ACCOUNT_STAFF_ROLES = new Set(['admin', 'superadmin', 'tecnico']);
const TICKET_LIST_STAFF_ROLES = new Set(['admin', 'superadmin', 'tecnico']);
const REPORT_ROLES = new Set(['admin', 'superadmin']);
const ADMIN_PANEL_ROLES = new Set(['admin', 'superadmin']);
const CALENDAR_ROLES = new Set(['admin', 'superadmin']);
const TICKET_ATTACHMENT_ROLES = new Set(['admin', 'superadmin', 'tecnico']);
const TICKET_SURVEY_ROLES = new Set(['admin', 'superadmin']);
const TICKET_ASSIGNMENT_ROLES = new Set(['admin', 'superadmin']);

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
    return hasRole(user, REPORT_ROLES);
}

function canManageAdmin(user) {
    return hasRole(user, ADMIN_PANEL_ROLES);
}

function canAccessCalendar(user) {
    return hasRole(user, CALENDAR_ROLES);
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
    REPORT_ROLES,
    TICKET_ATTACHMENT_ROLES,
    TICKET_SURVEY_ROLES,
    TICKET_ASSIGNMENT_ROLES,
    ADMIN_PANEL_ROLES,
    CALENDAR_ROLES,
    canAccessOwnedResource,
    canListAllTickets,
    canViewReports,
    canManageAdmin,
    canAccessCalendar,
    canManageAccounts,
    canManageAssignments,
    isAccountStaff
};
