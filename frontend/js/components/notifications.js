export function showNotification(message, variant = 'info') {
    const existing = document.getElementById('utea-global-toast');
    const toast = existing || document.createElement('div');
    toast.id = 'utea-global-toast';
    toast.className = `utea-toast utea-toast-${variant}`;
    toast.textContent = message;
    toast.setAttribute('role', 'status');
    if (!existing) {
        document.body.appendChild(toast);
    }
    toast.classList.add('visible');
    window.clearTimeout(toast._timeoutId);
    toast._timeoutId = window.setTimeout(() => toast.classList.remove('visible'), 3000);
    return toast;
}

export function showSuccess(message) {
    return showNotification(message, 'success');
}

export function showError(message) {
    return showNotification(message, 'error');
}
