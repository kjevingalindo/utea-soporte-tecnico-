import './config/app.config.js';
import './api/httpClient.js';
import './api/cuentas.api.js';
import './modules/moduleRegistry.js';
import { initializeTheme } from './config/theme.js';
import { initializeUI } from './components/ui.js';
import { ModalController } from './controllers/modalController.js';
import './components/modalAcceso.js';

async function initializeAppModules() {
    if (window.__UTEA_MODULAR_APP_BOOTSTRAPPED__) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    let user;
    try {
        const response = await window.fetchAPI('/api/auth/me', { allowHttpErrors: true });
        if (!response.ok) return;
        user = await response.json();
    } catch (error) {
        console.error('No se pudo validar la sesión para inicializar los módulos:', error);
        return;
    }

    const access = window.UTEAAccessControl;
    if (!access || !user?.rol) {
        console.error('No se pudo inicializar el control de acceso de los módulos.');
        return;
    }
    const canViewReports = access.canViewReports(user);
    const canManageAccounts = access.canManageAccounts(user);
    const canManageAdmin = access.canManageAdmin(user);
    const moduleImports = [
        import('./modules/dashboardModule.js'),
        import('./modules/ticketsModule.js')
    ];
    if (canManageAccounts) moduleImports.push(import('./modules/accountsModule.js'));
    if (canViewReports) moduleImports.push(import('./modules/reportsModule.js'));
    if (canManageAdmin) {
        moduleImports.push(import('./modules/adminModule.js'));
        moduleImports.push(import('./modules/configModule.js'));
    }

    const loadedModules = await Promise.all(moduleImports);
    window.__UTEA_MODULAR_APP_BOOTSTRAPPED__ = true;

    initializeTheme();
    initializeUI();
    window.modalController = new ModalController();
    window.ModalAcceso?.initialize();

    const registries = [
        ['dashboard', loadedModules[0].createDashboardModule],
        ['tickets', loadedModules[1].createTicketsModule]
    ];
    let moduleIndex = 2;
    if (canManageAccounts) registries.push(['accounts', loadedModules[moduleIndex++].createAccountsModule]);
    if (canViewReports) registries.push(['reports', loadedModules[moduleIndex++].createReportsModule]);
    if (canManageAdmin) {
        registries.push(['admin', loadedModules[moduleIndex++].createAdminModule]);
        registries.push(['config', loadedModules[moduleIndex].createConfigModule]);
    }

    registries.forEach(([name, factory]) => {
        if (window.UTEAApp?.registerModule) {
            window.UTEAApp.registerModule(name, factory);
        }
    });

    if (window.UTEAApp?.initModules) {
        window.UTEAApp.initModules();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAppModules, { once: true });
} else {
    initializeAppModules();
}
