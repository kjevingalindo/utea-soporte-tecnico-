import { showError, showSuccess } from '../components/notifications.js';
import { setButtonLoading } from '../components/buttons.js';

async function resolveCatalog(officeCode, categoryCode) {
    const officesResponse = await window.fetchAPI('/api/catalogos/oficinas');
    const offices = await officesResponse.json();
    if (!officesResponse.ok) throw new Error(offices.error || 'No se pudieron cargar las oficinas.');
    const office = offices.find(item => item.codigo === officeCode);
    if (!office) throw new Error(`No se encontró la oficina ${officeCode} en el catálogo.`);

    const query = new URLSearchParams({ oficina_id: office.id });
    const categoriesResponse = await window.fetchAPI(`/api/catalogos/categorias?${query}`);
    const categories = await categoriesResponse.json();
    if (!categoriesResponse.ok) throw new Error(categories.error || 'No se pudieron cargar las categorías.');
    const category = categories.find(item => item.codigo === categoryCode);
    if (!category) throw new Error(`No se encontró una categoría válida para ${office.nombre}.`);
    return { oficina_id: Number(office.id), categoria_id: Number(category.id) };
}

async function uploadEvidence(ticketId, file) {
    const formData = new FormData();
    formData.append('archivo', file);
    const response = await window.fetchAPI(`/api/adjuntos/${ticketId}`, {
        method: 'POST',
        body: formData,
        allowHttpErrors: true
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'No se pudo adjuntar la evidencia.');
}

function createStatusArea(form) {
    const status = document.createElement('div');
    status.className = 'ticket-create-status';
    status.setAttribute('role', 'status');
    status.hidden = true;
    form.insertAdjacentElement('afterend', status);
    return status;
}

function closeTicketDialog() {
    if (typeof window.closeQuickTicket === 'function') {
        window.closeQuickTicket();
        return;
    }
    const modal = document.getElementById('quickTicketModal');
    const overlay = document.getElementById('quickTicketOverlay');
    if (modal) {
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
    }
    if (overlay) overlay.style.display = 'none';
    document.getElementById('quickTicketOpen')?.focus();
}

export function createTicketsModule() {
    return {
        name: 'tickets',
        init() {
            document.querySelectorAll('#formTicket, form[data-ticket-form]').forEach(form => {
                if (form.dataset.ticketSubmitOwner === 'tickets') return;
                form.dataset.ticketSubmitOwner = 'tickets';
                const status = createStatusArea(form);

                const showEvidenceRetry = ({ ticketId, error, retry: retryEvidence }) => {
                    status.replaceChildren();
                    const message = document.createElement('p');
                    message.textContent = `El ticket #${ticketId} fue creado, pero no se pudo adjuntar la evidencia: ${error}`;
                    const retryButton = document.createElement('button');
                    retryButton.type = 'button';
                    retryButton.className = 'btn-secondary';
                    retryButton.textContent = 'Reintentar adjunto';
                    retryButton.addEventListener('click', () => {
                        retryButton.disabled = true;
                        retryEvidence();
                    });
                    status.append(message, retryButton);
                    status.hidden = false;
                };

                const handleSubmit = window.UTEATicketForm.createSubmitHandler(form, {
                    storage: sessionStorage,
                    hasSession: () => Boolean(localStorage.getItem('token')),
                    createIdempotencyKey: () => crypto.randomUUID(),
                    resolveCatalog,
                    createTicket: async (payload, key) => {
                        const response = await window.fetchAPI('/api/tickets', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Idempotency-Key': key
                            },
                            body: JSON.stringify(payload),
                            allowHttpErrors: true
                        });
                        const result = await response.json().catch(() => ({}));
                        if (!response.ok) {
                            const error = new Error(result.error || result.message || 'No se pudo crear el ticket.');
                            error.status = response.status;
                            throw error;
                        }
                        return result;
                    },
                    uploadEvidence,
                    refreshTickets: () => window.UTEARefreshTickets?.(),
                    onCreated: result => {
                        window.dispatchEvent(new CustomEvent('ticket:created', { detail: result }));
                    },
                    onRefreshFailure: (ticketId, error) => {
                        showError(`Ticket #${ticketId} creado, pero no se pudo actualizar la lista: ${error.message}`);
                    },
                    onAttachmentFailure: showEvidenceRetry,
                    onError: error => showError(error.message || 'No se pudo enviar el ticket.'),
                    onSuccess: showSuccess,
                    onComplete: () => {
                        status.hidden = true;
                        status.replaceChildren();
                    },
                    synchronizeForm: () => {
                        if (typeof window.sincronizarCampoAsignaturaDocente === 'function') {
                            window.sincronizarCampoAsignaturaDocente();
                        }
                    },
                    closeDialog: closeTicketDialog,
                    setBusy: (button, busy) => setButtonLoading(button, busy, 'Enviando...')
                });
                form.addEventListener('submit', handleSubmit);

                try {
                    const pending = window.UTEATicketForm.readPendingOperation(sessionStorage);
                    if (pending?.ticketId) {
                        status.textContent = `El ticket #${pending.ticketId} ya fue creado. Selecciona una evidencia y envía para reintentar únicamente el adjunto.`;
                        status.hidden = false;
                    }
                } catch (error) {
                    showError(error.message);
                }
            });
        }
    };
}
