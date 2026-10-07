export class ModalController {
    setOpen(dialog, overlay, isOpen, trigger) {
        if (!dialog || !overlay) return;

        dialog.style.display = isOpen ? 'block' : 'none';
        dialog.setAttribute('aria-hidden', String(!isOpen));
        overlay.style.display = isOpen ? 'block' : 'none';
        if (isOpen) dialog.focus();
        else trigger?.focus();
    }

    clearForms(container) {
        container?.querySelectorAll('form').forEach(form => form.reset());
    }
}
