(function exposeTicketDetailView(global) {
    function renderSummary(ticket, helpers) {
        const escape = helpers.escapeHTML;
        const requester = ticket.solicitante_nombre || ticket.username;
        const location = [
            ticket.bloque && `Bloque: ${escape(ticket.bloque)}`,
            ticket.ambiente && `Ambiente: ${escape(ticket.ambiente)}`,
            ticket.aula && `Aula: ${escape(ticket.aula)}`
        ].filter(Boolean).join('<br>');

        return `
            <div class="detalle-contenido" style="padding:10px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
                    <h3 style="margin:0; font-size:1.5rem; font-weight:600;">${escape(ticket.titulo)}</h3>
                    <button type="button" class="close-btn" data-ticket-detail-close aria-label="Cerrar detalle" style="background:none; border:none; font-size:1.25rem; cursor:pointer; color:var(--text-secondary); padding:4px;"><i class="ph ph-x"></i></button>
                </div>
                <div style="display:flex; gap:12px; margin-bottom:24px; flex-wrap:wrap;">
                    <span class="t-priority ${helpers.getPriorityClass(ticket.prioridad)}" style="display:inline-flex; align-items:center; gap:6px; padding:4px 8px; border-radius:6px; font-size:0.8rem; font-weight:500;">
                        <i class="ph-fill ph-flag"></i> ${escape(ticket.prioridad)}
                    </span>
                    <span class="t-status ${helpers.getStateClass(ticket.estado)}" style="display:inline-flex; align-items:center; padding:4px 8px; border-radius:6px; font-size:0.8rem; font-weight:500;">${escape(ticket.estado)}</span>
                    <span style="display:inline-flex; align-items:center; gap:6px; padding:4px 8px; border-radius:6px; background:var(--bg-surface-hover); color:var(--text-secondary); font-size:0.8rem;">
                        <i class="ph-fill ph-user"></i> ${escape(requester || 'Usuario')}
                    </span>
                </div>
                <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; margin-bottom:16px; color:var(--text-secondary); font-size:0.9rem;">
                    <div><strong>Oficina:</strong> ${escape(ticket.oficina_nombre || 'Sin clasificar')}</div>
                    <div><strong>Categoría:</strong> ${escape(ticket.categoria_nombre || 'Sin clasificar')}</div>
                    ${ticket.carrera ? `<div><strong>Carrera:</strong> ${escape(ticket.carrera)}</div>` : ''}
                    ${location ? `<div>${location}</div>` : ''}
                    ${ticket.asignatura_area ? `<div><strong>Asignatura / área:</strong> ${escape(ticket.asignatura_area)}</div>` : ''}
                    <div><strong>Solicitante:</strong> ${escape(requester || 'No registrado')}</div>
                    <div><strong>Código / DNI:</strong> ${escape(ticket.codigo_universitario_dni || 'No registrado')}</div>
                    <div><strong>Tipo:</strong> ${escape(ticket.tipo_solicitante || 'No especificado')}</div>
                    <div><strong>Ubicación:</strong> ${escape(ticket.ubicacion || 'No especificada')}</div>
                </div>
                <div style="background:var(--bg-main); padding:14px 16px; border-radius:8px; border:1px solid var(--border-color); margin-bottom:16px; font-size:0.88rem; line-height:1.6;">
                    <h4 style="margin:0 0 8px; font-size:0.95rem;">Acuerdos de nivel de servicio</h4>
                    ${helpers.getSlaDetailsHTML(ticket)}
                </div>
                <div style="background:var(--bg-main); padding:16px; border-radius:8px; border:1px solid var(--border-color); min-height:80px;">
                    <p style="margin:0; font-size:0.95rem; color:var(--text-primary); line-height:1.5; white-space:pre-wrap; overflow-wrap:anywhere;">
                        ${ticket.descripcion ? escape(ticket.descripcion) : '<em style="color:var(--text-secondary);">Sin descripción</em>'}
                    </p>
                </div>
        `;
    }

    function renderDetails(ticket, options) {
        const { role, helpers } = options;
        const escape = helpers.escapeHTML;
        const ticketId = escape(ticket.id);
        const isAdmin = role === 'admin';
        const scheduledDate = String(ticket.fecha_programada_iso || '').slice(0, 10);
        const isFinished = ['Solucionado', 'Cerrado'].includes(ticket.estado);
        const diagnostic = isAdmin ? `
            <div class="ticket-detail-section">
                <h4><i class="ph ph-stethoscope"></i> Diagnóstico técnico</h4>
                <form id="diagnosticoForm" data-ticket-id="${ticketId}" class="ticket-detail-form">
                    <textarea id="diagnosticoCausa" class="modal-textarea" placeholder="Causa probable" maxlength="3000"></textarea>
                    <textarea id="diagnosticoPruebas" class="modal-textarea" placeholder="Pruebas realizadas" maxlength="3000"></textarea>
                    <textarea id="diagnosticoSolucion" class="modal-textarea" placeholder="Solución aplicada" maxlength="3000"></textarea>
                    <textarea id="diagnosticoRecomendaciones" class="modal-textarea" placeholder="Recomendaciones" maxlength="3000"></textarea>
                    <button type="submit" class="btn-primary">Guardar diagnóstico</button>
                </form>
                <small id="diagnosticoMeta" class="text-muted"></small>
            </div>` : `
            <div class="ticket-detail-section">
                <h4><i class="ph ph-stethoscope"></i> Diagnóstico técnico</h4>
                <div id="diagnosticoConsulta" class="text-muted">Cargando diagnóstico...</div>
            </div>`;
        const schedule = isAdmin && !isFinished ? `
            <div class="ticket-detail-section">
                <h4>Programar solución</h4>
                <form id="programarTicketForm" data-ticket-id="${ticketId}" class="ticket-detail-form ticket-schedule-form">
                    <div class="form-group">
                        <label for="fechaProgramada">Fecha prevista</label>
                        <input id="fechaProgramada" type="date" class="modal-input" min="${escape(helpers.todayInPeru())}" value="${escape(scheduledDate)}">
                    </div>
                    <button type="submit" class="btn-primary">Guardar fecha</button>
                    ${scheduledDate ? '<button type="button" class="btn-small" data-clear-schedule>Quitar programación</button>' : ''}
                    <small id="programacionDisponibilidad" class="text-muted">Cantidad ilimitada de tickets por día.</small>
                </form>
            </div>` : '';
        const comments = role !== 'admin' ? `
            <div class="ticket-detail-section">
                <h4><i class="ph ph-chat-dots"></i> Comentarios y Notas</h4>
                <div id="detalleComentarios" class="ticket-detail-comments">Cargando comentarios...</div>
                <form id="detalleComentarioForm" data-ticket-id="${ticketId}" class="ticket-detail-comment-form">
                    <textarea id="detalleNuevoComentario" placeholder="Escribe un comentario..." required></textarea>
                    <button type="submit" class="btn-primary" aria-label="Enviar comentario"><i class="ph ph-paper-plane-right"></i></button>
                </form>
            </div>` : '';

        return `
            ${renderSummary(ticket, helpers)}
            ${diagnostic}
            <div class="ticket-detail-section">
                <h4><i class="ph ph-clock-counter-clockwise"></i> Historial del ticket</h4>
                <div id="ticketHistorial" class="ticket-detail-history">Cargando historial...</div>
            </div>
            <div class="ticket-detail-section">
                <h4><i class="ph ph-paperclip"></i> Evidencias adjuntas</h4>
                <form id="adjuntoForm" data-ticket-id="${ticketId}" class="ticket-detail-attachment-form">
                    <input id="adjuntoArchivo" name="archivo" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required>
                    <button type="submit" class="btn-primary">Adjuntar</button>
                    <small>JPG, PNG, WEBP o PDF, máximo 10 MB</small>
                </form>
                <div id="ticketAdjuntos" class="ticket-detail-attachments">Cargando evidencias...</div>
            </div>
            ${schedule}
            ${comments}
            <div class="ticket-detail-actions">
                ${isAdmin ? `
                    <label for="tecnicoAsignar">Asignar técnico</label>
                    <select id="tecnicoAsignar" class="modal-input">
                        <option value="">Seleccionar técnico</option>
                    </select>
                    <button type="button" class="btn-primary" data-ticket-assign="${ticketId}">Asignar</button>
                ` : ''}
                <button type="button" class="btn-small" data-ticket-detail-close>Cerrar</button>
            </div>
            </div>`;
    }

    const api = Object.freeze({ renderSummary, renderDetails });
    global.UTEATicketDetailView = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
