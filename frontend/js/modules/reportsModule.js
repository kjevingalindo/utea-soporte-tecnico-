import { showNotification } from '../components/notifications.js';

export function createReportsModule() {
    return {
        name: 'reports',
        init() {
            const reportSection = document.querySelector('[data-view="reportes"]');
            if (!reportSection) return;
            if (reportSection.dataset.moduleBound === 'reportes') return;
            reportSection.dataset.moduleBound = 'reportes';
            reportSection.dataset.module = 'reportes';

            const chartPlaceholder = reportSection.querySelector('[data-chart="monthly"]');
            if (chartPlaceholder) {
                chartPlaceholder.setAttribute('aria-label', 'Reporte mensual listo');
            }

            reportSection.addEventListener('click', event => {
                const button = event.target.closest('[data-report-action]');
                if (!button) return;
                showNotification('Reporte actualizado con los datos actuales.', 'info');
            }, { once: true });
        }
    };
}
