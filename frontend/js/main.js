import { initializeTheme } from './config/theme.js';
import { initializeUI } from './components/ui.js';
import { ModalController } from './controllers/modalController.js';
import './api/api.js';
import './api/cuentas.api.js';
import './components/modalAcceso.js';

function initializeAppModules() {
    initializeTheme();
    initializeUI();
    window.modalController = new ModalController();
    window.ModalAcceso?.initialize();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAppModules, { once: true });
} else {
    initializeAppModules();
}
