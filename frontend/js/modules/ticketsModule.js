import { showError, showSuccess } from '../components/notifications.js';
import { setButtonLoading } from '../components/buttons.js';

function getPendingTicketKey(form) {
    const storageKey = `utea.pending.ticket.${form.dataset.idempotencyKeyName || form.id || 'default'}`;
    const existing = sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const nextKey = crypto.randomUUID();
    sessionStorage.setItem(storageKey, nextKey);
    return nextKey;
}

function clearPendingTicketKey(form) {
    const storageKey = `utea.pending.ticket.${form.dataset.idempotencyKeyName || form.id || 'default'}`;
    sessionStorage.removeItem(storageKey);
}

function serializeTicketForm(form) {
    const entries = new FormData(form);
    const payload = {};
    for (const [key, value] of entries.entries()) {
        if (value === null || value === undefined || value === '') continue;
        payload[key] = typeof value === 'string' ? value.trim() : value;
    }
    return payload;
}

export function createTicketsModule() {
    return {
        name: 'tickets',
        init() {
            const forms = document.querySelectorAll('#formTicket, form[data-ticket-form]');
            if (!forms.length) return;

            forms.forEach(form => {
                if (form.dataset.moduleBound === 'tickets' || form.dataset.ticketSubmitOwner === 'legacy') return;
                form.dataset.moduleBound = 'tickets';
                form.dataset.ticketSubmitOwner = 'tickets';

                form.addEventListener('submit', async event => {
                    event.preventDefault();
                    if (form.dataset.submitInFlight === 'true') return;

                    const button = form.querySelector('button[type="submit"]');
                    const token = localStorage.getItem('token');
                    if (!token) {
                        showError('Debe iniciar sesión para registrar un ticket.');
                        return;
                    }

                    form.dataset.submitInFlight = 'true';
                    setButtonLoading(button, true, 'Enviando...');

                    const requestKey = getPendingTicketKey(form);
                    const payload = serializeTicketForm(form);

                    try {
                        const response = await window.fetchAPI('/api/tickets', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Idempotency-Key': requestKey
                            },
                            body: JSON.stringify(payload),
                            allowHttpErrors: true
                        });

                        const data = await response.json().catch(() => ({}));
                        if (!response.ok) {
                            throw new Error(data?.error || data?.message || 'No se pudo crear el ticket.');
                        }

                        showSuccess(data?.mensaje || 'Ticket creado correctamente.');
                        if (typeof window.dispatchEvent === 'function') {
                            window.dispatchEvent(new CustomEvent('ticket:created', { detail: data }));
                        }
                        if (typeof form.reset === 'function') form.reset();
                        clearPendingTicketKey(form);
                    } catch (error) {
                        showError(error.message || 'No se pudo enviar el ticket.');
                    } finally {
                        form.dataset.submitInFlight = 'false';
                        setButtonLoading(button, false);
                    }
                });
            });
        }
    };
}
