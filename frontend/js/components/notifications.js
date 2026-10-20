export function showNotification(message, variant = 'info') {
    const mappedVariant = variant === 'success' ? 'exito' : (variant === 'error' ? 'error' : 'info');
    if (typeof window !== 'undefined' && typeof window.mostrarMensaje === 'function') {
        window.mostrarMensaje(message, mappedVariant);
    }
    const existing = document.getElementById('utea-global-toast');
    const toast = existing || document.createElement('div');
    toast.id = 'utea-global-toast';
    toast.className = `utea-toast utea-toast-${variant}`;
    toast.textContent = message;
    toast.setAttribute('role', 'status');
    const bgColor = variant === 'error' ? '#ef4444' : (variant === 'success' ? '#10b981' : '#3b82f6');
    toast.style.cssText = `position:fixed; top:20px; right:20px; z-index:10000; padding:14px 20px; border-radius:8px; color:#fff; font-weight:600; font-size:0.9rem; box-shadow:0 4px 12px rgba(0,0,0,0.15); background-color:${bgColor}; transition:opacity 0.3s;`;
    if (!existing) {
        document.body.appendChild(toast);
    }
    toast.style.display = 'block';
    toast.style.opacity = '1';
    window.clearTimeout(toast._timeoutId);
    toast._timeoutId = window.setTimeout(() => {
        toast.style.opacity = '0';
        window.setTimeout(() => { toast.style.display = 'none'; }, 300);
    }, 4000);
    return toast;
}

export function showSuccess(message) {
    return showNotification(message, 'success');
}

export function showError(message) {
    return showNotification(message, 'error');
}
