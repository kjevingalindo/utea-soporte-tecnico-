import { showNotification } from '../components/notifications.js';

export function createAdminModule() {
    return {
        name: 'admin',
        init() {
            const adminView = document.getElementById('view-admin');
            if (!adminView) return;
            if (adminView.dataset.moduleBound === 'admin') return;
            adminView.dataset.moduleBound = 'admin';
            adminView.dataset.module = 'admin';

            adminView.addEventListener('click', event => {
                const action = event.target.closest('[data-admin-action]');
                if (!action) return;
                showNotification('Panel administrativo listo para gestión.', 'info');
            }, { once: true });
        }
    };
}
