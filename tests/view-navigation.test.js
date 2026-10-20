const test = require('node:test');
const assert = require('node:assert/strict');
const { activateView } = require('../frontend/js/viewNavigation');

function element(id, hidden = true) {
    const classes = new Set();
    return {
        id,
        hidden,
        classList: {
            add(name) { classes.add(name); },
            remove(name) { classes.delete(name); },
            toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); },
            contains(name) { return classes.has(name); }
        }
    };
}

test('view navigation clears the native hidden attribute and hides inactive views', () => {
    const dashboard = element('view-dashboard', false);
    const reports = element('view-reportes');
    const navDashboard = element('nav-dashboard', false);
    const navReports = element('nav-reportes', false);
    const views = [dashboard, reports];
    const navItems = [navDashboard, navReports];
    const document = {
        querySelectorAll(selector) {
            return selector === '.view-section' ? views : navItems;
        },
        getElementById(id) { return views.find(view => view.id === id) || null; },
        querySelector() { return navReports; }
    };

    activateView(document, 'reportes');

    assert.equal(dashboard.hidden, true);
    assert.equal(dashboard.classList.contains('active'), false);
    assert.equal(reports.hidden, false);
    assert.equal(reports.classList.contains('active'), true);
    assert.equal(navReports.classList.contains('active'), true);
    assert.equal(navDashboard.classList.contains('active'), false);
});
