import { showError } from '../components/notifications.js';

export function createReportsModule() {
    return {
        name: 'reports',
        init() {
            const reportSection = document.getElementById('view-reportes');
            if (!reportSection) return;
            if (reportSection.dataset.moduleBound === 'reportes') return;
            reportSection.dataset.moduleBound = 'reportes';
            reportSection.dataset.module = 'reportes';

            reportSection.addEventListener('click', async event => {
                const target = event.target instanceof Element ? event.target : null;
                const button = target?.closest('[data-report-action]');
                if (!button) return;
                button.disabled = true;
                try {
                    if (button.dataset.reportAction === 'pdf') {
                        if (typeof window.generarReportePDFMensual !== 'function') {
                            throw new Error('La acción para imprimir el reporte no está disponible.');
                        }
                        window.generarReportePDFMensual();
                    } else if (button.dataset.reportAction === 'csv') {
                        if (typeof window.exportarTicketsExcel !== 'function') {
                            throw new Error('La descarga CSV no está disponible.');
                        }
                        await window.exportarTicketsExcel();
                    }
                } catch (error) {
                    showError(error.message || 'No se pudo generar el reporte.');
                } finally {
                    button.disabled = false;
                }
            });
        }
    };
}
