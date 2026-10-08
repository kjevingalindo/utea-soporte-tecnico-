import { showNotification } from '../components/notifications.js';

export function createAccountsModule() {
    return {
        name: 'accounts',
        init() {
            const accountSection = document.getElementById('accountStatsSection');
            if (!accountSection) return;
            if (accountSection.dataset.moduleBound === 'accounts') return;
            accountSection.dataset.moduleBound = 'accounts';
            accountSection.dataset.module = 'accounts';

            const button = accountSection.querySelector('[data-account-action="reload"]');
            button?.addEventListener('click', () => {
                showNotification('Cuentas institucionales actualizadas.', 'success');
            }, { once: true });
        }
    };
}
