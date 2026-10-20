(function exposeAccessControl(global) {
    const TICKET_LIST_STAFF_ROLES = new Set(['admin', 'superadmin', 'tecnico']);
    const REPORT_ROLES = new Set(['admin', 'superadmin']);
    const ACCOUNT_STAFF_ROLES = new Set(['admin', 'superadmin', 'tecnico']);
    const ADMIN_PANEL_ROLES = new Set(['admin', 'superadmin']);
    const CALENDAR_ROLES = new Set(['admin', 'superadmin']);

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
            return hasRole(user, REPORT_ROLES);
        },
        canManageAccounts(user) {
            return hasRole(user, ACCOUNT_STAFF_ROLES);
        },
        canManageAdmin(user) {
            return hasRole(user, ADMIN_PANEL_ROLES);
        },
        canAccessCalendar(user) {
            return hasRole(user, CALENDAR_ROLES);
        },
        canManageAssignments(user) {
            return ['admin', 'superadmin'].includes(roleOf(user));
        }
    });
})(window);
