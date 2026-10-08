import { showNotification } from '../components/notifications.js';

export function createConfigModule() {
    return {
        name: 'config',
        init() {
            const configView = document.getElementById('view-configuracion');
            if (!configView) return;
            if (configView.dataset.moduleBound === 'config') return;
            configView.dataset.moduleBound = 'config';
            configView.dataset.module = 'config';

            const themeToggle = document.getElementById('darkModeToggle');
            themeToggle?.addEventListener('click', () => {
                showNotification('Configuración visual actualizada.', 'info');
            }, { once: true });
        }
    };
}
