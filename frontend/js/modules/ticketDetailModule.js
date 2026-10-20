(function exposeTicketDetailModule(global) {
    let commentsService;
    let activeContext = null;

    function getCommentsService() {
        if (!commentsService) commentsService = global.UTEAComments.createCommentsService();
        return commentsService;
    }

    async function requestJson(endpoint, options) {
        const response = await global.fetchAPI(endpoint, { ...options, allowHttpErrors: true });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(result.error || result.message || `Error HTTP ${response.status}.`);
        }
        return result;
    }

    function getCurrentDetail(ticketId) {
        const detail = global.document.getElementById('ticketDetalle');
        return detail?.dataset.ticketId === String(ticketId) ? detail : null;
    }

    function showError(error, fallback) {
        global.mostrarMensaje?.(error.message || fallback, 'error');
    }

    async function loadComments(ticketId) {
        const detail = getCurrentDetail(ticketId);
        const list = detail?.querySelector('#detalleComentarios');
        if (!detail || !list) return;
        list.textContent = 'Cargando comentarios...';
        try {
            const comments = await getCommentsService().list(ticketId);
            if (getCurrentDetail(ticketId) !== detail) return;
            global.UTEASafeText.renderComments(list, comments);
            list.scrollTop = list.scrollHeight;
        } catch (error) {
            if (getCurrentDetail(ticketId) === detail) {
                list.textContent = error.message || 'No se pudieron cargar los comentarios.';
            }
            showError(error, 'No se pudieron cargar los comentarios.');
        }
    }

    async function loadHistory(ticketId) {
        const detail = getCurrentDetail(ticketId);
        const list = detail?.querySelector('#ticketHistorial');
        if (!detail || !list) return;
        try {
            const history = await requestJson(`/api/tickets/${encodeURIComponent(ticketId)}/historial`);
            if (getCurrentDetail(ticketId) === detail) global.UTEASafeText.renderHistory(list, history);
        } catch (error) {
            if (getCurrentDetail(ticketId) === detail) list.textContent = error.message || 'No se pudo cargar el historial.';
            showError(error, 'No se pudo cargar el historial.');
        }
    }

    function renderAttachments(container, attachments, ticketId) {
        container.replaceChildren();
        if (!attachments.length) {
            container.textContent = 'Todavía no hay evidencias adjuntas.';
            return;
        }
        attachments.forEach(attachment => {
            const row = global.document.createElement('div');
            row.className = 'ticket-detail-attachment';
            const description = global.document.createElement('div');
            const name = global.document.createElement('strong');
            name.textContent = attachment.nombre_original || 'Evidencia';
            const metadata = global.document.createElement('small');
            const sizeMb = (Number(attachment.tamano_bytes) / 1024 / 1024).toFixed(2);
            const created = attachment.created_at
                ? new Date(attachment.created_at).toLocaleString('es-PE', { timeZone: 'America/Lima' })
                : '';
            metadata.textContent = `${sizeMb} MB${created ? ` · ${created}` : ''}`;
            description.append(name, metadata);
            const download = global.document.createElement('button');
            download.type = 'button';
            download.className = 'btn-small';
            download.dataset.downloadAttachment = String(attachment.id);
            download.dataset.ticketId = String(ticketId);
            download.dataset.fileName = String(attachment.nombre_original || 'evidencia');
            download.setAttribute('aria-label', `Descargar ${attachment.nombre_original || 'evidencia'}`);
            download.innerHTML = '<i class="ph ph-download-simple"></i>';
            row.append(description, download);
            container.appendChild(row);
        });
    }

    async function loadAttachments(ticketId) {
        const detail = getCurrentDetail(ticketId);
        const container = detail?.querySelector('#ticketAdjuntos');
        if (!detail || !container) return;
        try {
            const attachments = await requestJson(`/api/adjuntos/${encodeURIComponent(ticketId)}`);
            if (getCurrentDetail(ticketId) === detail) renderAttachments(container, attachments, ticketId);
        } catch (error) {
            if (getCurrentDetail(ticketId) === detail) container.textContent = error.message || 'No se pudieron cargar las evidencias.';
            showError(error, 'No se pudieron cargar las evidencias.');
        }
    }

    async function loadDiagnosis(ticketId, role) {
        const detail = getCurrentDetail(ticketId);
        if (!detail) return;
        try {
            const diagnosis = await requestJson(`/api/diagnosticos/${encodeURIComponent(ticketId)}`);
            if (getCurrentDetail(ticketId) !== detail) return;
            if (role === 'admin') {
                const values = {
                    diagnosticoCausa: diagnosis?.causa_probable || '',
                    diagnosticoPruebas: diagnosis?.pruebas_realizadas || '',
                    diagnosticoSolucion: diagnosis?.solucion_aplicada || '',
                    diagnosticoRecomendaciones: diagnosis?.recomendaciones || ''
                };
                Object.entries(values).forEach(([id, value]) => {
                    const input = detail.querySelector(`#${id}`);
                    if (input) input.value = value;
                });
                const meta = detail.querySelector('#diagnosticoMeta');
                if (meta && diagnosis) {
                    meta.textContent = `Última actualización: ${new Date(diagnosis.updated_at).toLocaleString('es-PE', { timeZone: 'America/Lima' })}${diagnosis.tecnico_nombre ? ` por ${diagnosis.tecnico_nombre}` : ''}`;
                }
                return;
            }

            const container = detail.querySelector('#diagnosticoConsulta');
            if (!container) return;
            container.replaceChildren();
            const fields = [
                ['Causa probable', diagnosis?.causa_probable],
                ['Pruebas realizadas', diagnosis?.pruebas_realizadas],
                ['Solución aplicada', diagnosis?.solucion_aplicada],
                ['Recomendaciones', diagnosis?.recomendaciones]
            ].filter(([, value]) => value);
            if (!fields.length) {
                container.textContent = 'Aún no hay diagnóstico técnico registrado.';
                return;
            }
            fields.forEach(([label, value]) => {
                const paragraph = global.document.createElement('p');
                const heading = global.document.createElement('strong');
                heading.textContent = `${label}:`;
                paragraph.append(heading, global.document.createElement('br'), global.document.createTextNode(value));
                container.appendChild(paragraph);
            });
        } catch (error) {
            const container = detail.querySelector('#diagnosticoConsulta');
            if (container) container.textContent = error.message || 'No se pudo cargar el diagnóstico.';
            showError(error, 'No se pudo cargar el diagnóstico.');
        }
    }

    async function loadTechnicians(ticket) {
        const detail = getCurrentDetail(ticket.id);
        const select = detail?.querySelector('#tecnicoAsignar');
        if (!detail || !select) return;
        try {
            const url = ticket.oficina_id ? `/api/tecnicos?oficina_id=${encodeURIComponent(ticket.oficina_id)}` : '/api/tecnicos';
            const technicians = await requestJson(url);
            if (!technicians.length) {
                select.replaceChildren(new global.Option('No hay técnicos asignados a esta oficina', ''));
                select.disabled = true;
                const assignBtn = detail.querySelector('[data-ticket-assign]');
                if (assignBtn) assignBtn.disabled = true;
                return;
            }
            select.disabled = false;
            const assignBtn = detail.querySelector('[data-ticket-assign]');
            if (assignBtn) assignBtn.disabled = false;
            select.replaceChildren(new global.Option('Seleccionar técnico', ''));
            technicians.forEach(technician => {
                const label = technician.es_responsable ? `${technician.nombre} (Responsable)` : technician.nombre;
                const option = new global.Option(label, technician.id);
                option.selected = Number(technician.id) === Number(ticket.tecnico_id);
                select.add(option);
            });
        } catch (error) {
            select.replaceChildren(new global.Option('No se pudieron cargar los técnicos', ''));
            showError(error, 'No se pudieron cargar los técnicos.');
        }
    }

    function close() {
        const detail = global.document.getElementById('ticketDetalle');
        if (detail) {
            detail.style.display = 'none';
            delete detail.dataset.ticketId;
        }
        const overlay = global.document.getElementById('overlay');
        if (overlay) overlay.style.display = 'none';
        activeContext = null;
    }

    function open(ticket, context) {
        if (!ticket || !Number.isSafeInteger(Number(ticket.id))) {
            throw new Error('No se puede abrir un ticket sin identificador válido.');
        }
        const detail = global.document.getElementById('ticketDetalle');
        const overlay = global.document.getElementById('overlay');
        if (!detail || !overlay) throw new Error('No está disponible el panel de detalle del ticket.');
        if (!global.UTEATicketDetailView || !global.UTEASafeText || !global.UTEAComments) {
            throw new Error('No están disponibles los componentes necesarios para mostrar el ticket.');
        }
        activeContext = { role: context.role, ticketId: String(ticket.id) };
        detail.dataset.ticketId = String(ticket.id);
        detail.innerHTML = global.UTEATicketDetailView.renderDetails(ticket, context);
        detail.style.display = 'block';
        overlay.style.display = 'block';
        loadHistory(ticket.id);
        loadAttachments(ticket.id);
        loadDiagnosis(ticket.id, context.role);
        if (context.role !== 'admin') loadComments(ticket.id);
        if (context.role === 'admin') loadTechnicians(ticket);
        if (context.role === 'admin' && context.refreshSchedule) context.refreshSchedule(ticket);
    }

    async function submitAttachment(form) {
        const detail = global.document.getElementById('ticketDetalle');
        const file = form.querySelector('input[type="file"]')?.files?.[0];
        const button = form.querySelector('button[type="submit"]');
        if (!file || !button) return;
        button.disabled = true;
        try {
            const body = new global.FormData();
            body.append('archivo', file);
            const result = await requestJson(`/api/adjuntos/${encodeURIComponent(form.dataset.ticketId)}`, {
                method: 'POST',
                body
            });
            form.reset();
            global.mostrarMensaje?.(result.mensaje || 'Evidencia adjuntada correctamente', 'exito');
            await loadAttachments(form.dataset.ticketId);
        } catch (error) {
            showError(error, 'No se pudo adjuntar la evidencia.');
        } finally {
            button.disabled = false;
            if (!detail.isConnected) return;
        }
    }

    async function downloadAttachment(button) {
        button.disabled = true;
        try {
            const { ticketId, downloadAttachment: attachmentId, fileName } = button.dataset;
            const response = await global.fetchAPI(
                `/api/adjuntos/${encodeURIComponent(ticketId)}/${encodeURIComponent(attachmentId)}/descargar`
            );
            const objectUrl = global.URL.createObjectURL(await response.blob());
            const link = global.document.createElement('a');
            link.href = objectUrl;
            link.download = fileName;
            link.click();
            global.setTimeout(() => global.URL.revokeObjectURL(objectUrl), 1000);
        } catch (error) {
            showError(error, 'No se pudo descargar la evidencia.');
        } finally {
            button.disabled = false;
        }
    }

    async function submitDiagnosis(form) {
        const detail = global.document.getElementById('ticketDetalle');
        const button = form.querySelector('button[type="submit"]');
        if (!button) return;
        const payload = Object.fromEntries([
            ['causa_probable', 'diagnosticoCausa'],
            ['pruebas_realizadas', 'diagnosticoPruebas'],
            ['solucion_aplicada', 'diagnosticoSolucion'],
            ['recomendaciones', 'diagnosticoRecomendaciones']
        ].map(([key, id]) => [key, detail.querySelector(`#${id}`)?.value || '']));
        button.disabled = true;
        try {
            const result = await requestJson(`/api/diagnosticos/${encodeURIComponent(form.dataset.ticketId)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            global.mostrarMensaje?.(result.mensaje || 'Diagnóstico guardado.', 'exito');
            await loadDiagnosis(form.dataset.ticketId, activeContext?.role || 'admin');
        } catch (error) {
            showError(error, 'No se pudo guardar el diagnóstico.');
        } finally {
            button.disabled = false;
        }
    }

    function createTicketDetailModule() {
        return {
            name: 'ticketDetail',
            init() {
                const detail = global.document.getElementById('ticketDetalle');
                if (!detail || detail.dataset.ticketDetailModuleBound === 'true') return;
                if (!global.UTEAComments || !global.UTEASafeText) {
                    throw new Error('No están disponibles los servicios necesarios para el detalle del ticket.');
                }
                detail.dataset.ticketDetailModuleBound = 'true';
                detail.addEventListener('click', event => {
                    if (!(event.target instanceof Element)) return;
                    const closeButton = event.target.closest('[data-ticket-detail-close]');
                    if (closeButton) {
                        global.cerrarDetalle?.();
                        return;
                    }
                    const assignButton = event.target.closest('[data-ticket-assign]');
                    if (assignButton) {
                        global.asignarTecnico?.(assignButton.dataset.ticketAssign);
                        return;
                    }
                    const downloadButton = event.target.closest('[data-download-attachment]');
                    if (downloadButton) downloadAttachment(downloadButton);
                });
                detail.addEventListener('submit', async event => {
                    if (!(event.target instanceof HTMLFormElement)) return;
                    const form = event.target;
                    if (form.id === 'detalleComentarioForm') {
                        event.preventDefault();
                        const input = form.querySelector('#detalleNuevoComentario');
                        const button = form.querySelector('button[type="submit"]');
                        const comment = input?.value.trim();
                        if (!comment || !button) return;
                        button.disabled = true;
                        try {
                            await getCommentsService().add(form.dataset.ticketId, comment);
                            if (getCurrentDetail(form.dataset.ticketId) !== detail) return;
                            input.value = '';
                            await loadComments(form.dataset.ticketId);
                        } catch (error) {
                            showError(error, 'No se pudo agregar el comentario.');
                        } finally {
                            button.disabled = false;
                        }
                        return;
                    }
                    if (form.id === 'adjuntoForm') {
                        event.preventDefault();
                        await submitAttachment(form);
                        return;
                    }
                    if (form.id === 'diagnosticoForm') {
                        event.preventDefault();
                        await submitDiagnosis(form);
                    }
                });
            }
        };
    }

    const api = Object.freeze({ open, close, loadComments, loadHistory, loadAttachments, createTicketDetailModule });
    global.UTEATicketDetail = api;
    global.UTEATicketDetailModule = Object.freeze({ createTicketDetailModule });
    if (typeof module !== 'undefined' && module.exports) module.exports = global.UTEATicketDetailModule;
})(window);
