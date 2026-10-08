import { showNotification } from '../components/notifications.js';

export function createDashboardModule() {
    return {
        name: 'dashboard',
        init() {
            const section = document.getElementById('view-dashboard');
            if (!section) return;
            if (section.dataset.moduleBound === 'dashboard') return;
            section.dataset.moduleBound = 'dashboard';

            const cards = section.querySelectorAll('.kpi-card');
            cards.forEach(card => card.setAttribute('data-module', 'dashboard'));

            const action = document.getElementById('quickTicketOpen');
            action?.addEventListener('click', () => {
                showNotification('Dashboard listo para atender incidencias.', 'info');
            }, { once: true });
        }
    };
}
