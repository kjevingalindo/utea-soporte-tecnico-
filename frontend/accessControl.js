(function exposeAccessControl(global) {
    const TICKET_LIST_STAFF_ROLES = new Set(['admin', 'superadmin', 'tecnico']);
    const ACCOUNT_STAFF_ROLES = new Set(['admin', 'superadmin', 'tecnico', 'adminti']);

    function roleOf(user) {
        return String(user?.rol || '').toLowerCase();
    }

    function hasRole(user, roles) {
        return roles.has(roleOf(user));
    }

    global.UTEAAccessControl = Object.freeze({
        canListAllTickets(user) {
            return hasRole(user, TICKET_LIST_STAFF_ROLES);
        },
        canViewReports(user) {
            return hasRole(user, TICKET_LIST_STAFF_ROLES);
        },
        canManageAccounts(user) {
            return hasRole(user, ACCOUNT_STAFF_ROLES);
        },
        canManageAdmin(user) {
            return roleOf(user) === 'admin';
        },
        canManageAssignments(user) {
            return ['admin', 'superadmin', 'adminti'].includes(roleOf(user));
        }
    });
})(window);
