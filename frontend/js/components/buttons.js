export function setButtonLoading(button, isLoading, label) {
    if (!button) return;
    const text = button.dataset.defaultText || button.textContent;
    if (isLoading) {
        button.dataset.defaultText = text;
        button.disabled = true;
        button.textContent = label || 'Procesando...';
        button.classList.add('is-loading');
    } else {
        button.disabled = false;
        button.textContent = label || button.dataset.defaultText || text;
        button.classList.remove('is-loading');
    }
}
