export function createModal(options = {}) {
    const { id = 'utea-modal', title = 'Detalle', content = '', closeOnEsc = true } = options;
    let modal = document.getElementById(id);
    if (!modal) {
        modal = document.createElement('div');
        modal.id = id;
        modal.className = 'utea-modal hidden';
        modal.innerHTML = `
            <div class="utea-modal-backdrop" data-close="true"></div>
            <div class="utea-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="${id}-title">
                <div class="utea-modal-header">
                    <h3 id="${id}-title">${title}</h3>
                    <button type="button" class="utea-modal-close" aria-label="Cerrar">×</button>
                </div>
                <div class="utea-modal-body"></div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    const body = modal.querySelector('.utea-modal-body');
    body.innerHTML = content;
    const closeButton = modal.querySelector('.utea-modal-close');
    const previousFocus = document.activeElement;

    modal.classList.remove('hidden');
    setTimeout(() => {
        closeButton?.focus();
    }, 10);

    const close = () => {
        modal.classList.add('hidden');
        previousFocus?.focus?.();
    };

    closeButton?.addEventListener('click', close, { once: true });
    modal.querySelector('[data-close="true"]').addEventListener('click', close, { once: true });

    if (closeOnEsc) {
        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                close();
                document.removeEventListener('keydown', onKeyDown);
            }
        };
        document.addEventListener('keydown', onKeyDown);
    }

    return { modal, close };
}
