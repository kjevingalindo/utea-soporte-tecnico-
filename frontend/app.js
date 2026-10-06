document.addEventListener('DOMContentLoaded', () => {

    const token = localStorage.getItem('token');
    if (!token) {
        window.location.replace('/login.html');
        return;
    }

    function fetch(url, options = {}) {
        const currentToken = localStorage.getItem('token');
        if (!currentToken) {
            window.location.replace('/login.html');
            return Promise.reject(new Error('La sesión expiró'));
        }

        const headers = new Headers(options.headers || {});
        headers.set('Authorization', `Bearer ${currentToken}`);
        return window.fetch(url, { ...options, headers }).then(response => {
            if (response.status === 401 || response.status === 403) {
                localStorage.clear();
                window.location.replace('/login.html');
            }
            return response;
        });
    }

    const username = localStorage.getItem('username');
    const rol = localStorage.getItem('rol');
    const userRole = localStorage.getItem('userRole') || rol;
    const userRoleNormalizado = String(userRole || '').toLowerCase();
    const puedeAsignarTecnico = ['admin', 'superadmin', 'adminti'].includes(userRoleNormalizado);
    if (rol !== 'admin') {
        document.querySelector('.nav-item[data-view="admin"]')?.remove();
        document.getElementById('view-admin')?.remove();
        document.querySelector('.nav-item[data-view="configuracion"]')?.remove();
        document.getElementById('view-configuracion')?.remove();
    }

    document.getElementById('usuarioActivo').textContent = username || 'Usuario';
    const avatarEl = document.getElementById('avatarLetra');
    if(avatarEl) avatarEl.textContent = username ? username.charAt(0).toUpperCase() : 'U';

    // Mostrar badge de rol
    const rolBadge = document.getElementById('rolBadge');
    if (rolBadge) {
        rolBadge.textContent = rol === 'admin' ? 'Admin' : 'Usuario';
        rolBadge.classList.add(rol === 'admin' ? 'rol-admin' : 'rol-usuario');
    }

    // Mostrar asignación de tecnico solo para admin
    if (puedeAsignarTecnico) {
        const asignarTecnicoContainer = document.getElementById('asignarTecnicoContainer');
        if (asignarTecnicoContainer) asignarTecnicoContainer.hidden = false;
    }

    const catalogoPorAmbiente = {
        'Salones / Aulas': { oficina: 'AUL', categoria: 'AUL-PROYECTOR' },
        'Laboratorio de Agronomía y Ambiental': { oficina: 'LAB', categoria: 'LAB-COMPUTADORAS' },
        'Auditorio': { oficina: 'AUL', categoria: 'AUL-AUDIO' },
        'Centro de Cómputo': { oficina: 'LAB', categoria: 'LAB-COMPUTADORAS' },
        'Servicios Académicos': { oficina: 'SAC', categoria: 'SAC-MATRICULAS' },
        'Admisión': { oficina: 'ADMIS', categoria: 'ADMIS-POSTULANTE' },
        'Grados y Títulos': { oficina: 'GYT', categoria: 'GYT-EXPEDIENTES' },
        'Mesa de Partes': { oficina: 'MDP', categoria: 'MDP-TRAMITE' },
        'Administración': { oficina: 'ADM', categoria: 'ADM-EQUIPOS' },
        'Subdirección de Derecho': { oficina: 'SUB-DER', categoria: 'SUBDER-EQUIPOS' },
        'Subdirección de Agronomía, Ing. Ambiental e Ing. Civil': { oficina: 'SUB-ING', categoria: 'SUBING-EQUIPOS' },
        'Subdirección de Contabilidad y Educación': { oficina: 'SUB-CED', categoria: 'SUBCED-EQUIPOS' },
        'Subdirección de Enfermería': { oficina: 'SUB-ENF', categoria: 'SUBENF-EQUIPOS' },
        'Tópico': { oficina: 'TOP', categoria: 'TOP-ATENCION' },
        'Sala de Docentes': { oficina: 'SDOC', categoria: 'SDOC-EQUIPOS' },
        'Biblioteca': { oficina: 'BIB', categoria: 'BIB-EQUIPOS' },
        'Laboratorio de Ingeniería Civil': { oficina: 'LAB', categoria: 'LAB-COMPUTADORAS' }
    };
    let oficinasCatalogoPromise;
    const categoriasPorOficina = new Map();

    async function resolverCatalogoAmbiente(ambiente) {
        const mapeo = catalogoPorAmbiente[ambiente];
        if (!mapeo) throw new Error('No existe un mapeo de oficina para el ambiente seleccionado');

        if (!oficinasCatalogoPromise) {
            oficinasCatalogoPromise = fetch('/api/catalogos/oficinas').then(async response => {
                const oficinas = await response.json();
                if (!response.ok) throw new Error(oficinas.error || 'No se pudieron cargar las oficinas');
                return oficinas;
            });
        }
        const oficinas = await oficinasCatalogoPromise;
        const oficina = oficinas.find(item => item.codigo === mapeo.oficina);
        if (!oficina) throw new Error(`No se encontró la oficina ${mapeo.oficina} en el catálogo`);

        if (!categoriasPorOficina.has(oficina.id)) {
            const params = new URLSearchParams({ oficina_id: oficina.id });
            const categoriasPromise = fetch(`/api/catalogos/categorias?${params}`).then(async response => {
                const categorias = await response.json();
                if (!response.ok) throw new Error(categorias.error || 'No se pudieron cargar las categorías');
                return categorias;
            });
            categoriasPorOficina.set(oficina.id, categoriasPromise);
        }
        const categorias = await categoriasPorOficina.get(oficina.id);
        const categoria = categorias.find(item => item.codigo === mapeo.categoria);
        if (!categoria) throw new Error(`No se encontró la categoría ${mapeo.categoria} para ${oficina.nombre}`);

        return { oficina_id: Number(oficina.id), categoria_id: Number(categoria.id) };
    }

    // Saludo dinámico
    function actualizarSaludo() {
        const hora = new Date().getHours();
        let saludo;
        if (hora >= 5 && hora < 12) saludo = 'Buenos días';
        else if (hora >= 12 && hora < 18) saludo = 'Buenas tardes';
        else saludo = 'Buenas noches';

        const greetEl = document.getElementById('greetingText');
        if (greetEl) greetEl.textContent = `${saludo}, ${username || 'Usuario'} 👋`;

        const subEl = document.getElementById('greetingSubtext');
        if (subEl) {
            subEl.textContent = rol === 'admin' 
                ? 'Aquí tienes un resumen general del sistema' 
                : 'Aquí tienes un resumen de tus tickets';
        }
    }
    actualizarSaludo();

    function getPrioridadClass(prioridad) {
        switch(prioridad) {
            case 'Critica':
            case 'Urgente': return 'pri-urgente';
            case 'Alta': return 'pri-alta';
            case 'Baja': return 'pri-baja';
            default: return 'pri-media';
        }
    }

    function getEstadoClass(estado) {
        if (['Solucionado', 'Cerrado'].includes(estado)) return 'status-resuelto';
        if (estado === 'Esperando usuario') return 'status-pendiente';
        return 'status-nuevo';
    }

    function getSlaStatus(ticket) {
        const responseDueAt = Number(ticket.sla_response_due_at);
        const resolutionDueAt = Number(ticket.sla_resolution_due_at);
        if (!responseDueAt || !resolutionDueAt) return 'Sin SLA';

        const now = Date.now();
        const firstResponseAt = Number(ticket.sla_first_response_at);
        const resolvedAt = Number(ticket.sla_resolved_at);
        const isResolved = ['Solucionado', 'Cerrado'].includes(ticket.estado);
        const effectiveResponseAt = firstResponseAt || (isResolved ? resolvedAt : 0);
        const responseLate = effectiveResponseAt
            ? effectiveResponseAt > responseDueAt
            : now > responseDueAt;
        const resolutionLate = resolvedAt
            ? resolvedAt > resolutionDueAt
            : !isResolved && now > resolutionDueAt;

        if (responseLate || resolutionLate) return 'SLA vencido';
        if (isResolved && resolvedAt) return 'SLA cumplido';
        return 'En plazo';
    }

    function formatSlaDate(timestamp) {
        return new Date(Number(timestamp)).toLocaleString('es-PE', {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: 'America/Lima'
        });
    }

    function getSlaDetailsHTML(ticket) {
        const responseDueAt = Number(ticket.sla_response_due_at);
        const resolutionDueAt = Number(ticket.sla_resolution_due_at);
        if (!responseDueAt || !resolutionDueAt) {
            return '<p style="margin:0; color:var(--text-secondary);">Este ticket no tiene objetivos SLA registrados.</p>';
        }

        const firstResponseAt = Number(ticket.sla_first_response_at);
        const resolvedAt = Number(ticket.sla_resolved_at);
        const isResolved = ['Solucionado', 'Cerrado'].includes(ticket.estado);
        const effectiveResponseAt = firstResponseAt || (isResolved ? resolvedAt : 0);
        const responseText = effectiveResponseAt
            ? `${firstResponseAt ? 'Respondido' : 'Solucionado'} ${formatSlaDate(effectiveResponseAt)} (${effectiveResponseAt <= responseDueAt ? 'en plazo' : 'fuera de plazo'})`
            : `Pendiente; vence ${formatSlaDate(responseDueAt)}`;
        const resolutionText = resolvedAt
            ? `Solucionado ${formatSlaDate(resolvedAt)} (${resolvedAt <= resolutionDueAt ? 'en plazo' : 'fuera de plazo'})`
            : isResolved
                ? 'Ticket finalizado antes del registro de SLA'
                : `Pendiente; vence ${formatSlaDate(resolutionDueAt)}`;

        return `
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px;">
                <div><strong>Primera respuesta:</strong><br>${escapeHTML(responseText)}</div>
                <div><strong>Resolución:</strong><br>${escapeHTML(resolutionText)}</div>
                <div><strong>Estado SLA:</strong> ${escapeHTML(getSlaStatus(ticket))}</div>
                <div style="color:var(--text-secondary);">Horario: lunes a viernes, 8:00–16:30 (hora de Perú)</div>
            </div>
        `;
    }

    function escapeHTML(value) {
        return String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[character]);
    }

    window.allTickets = [];
    let agendaMesActual = new Date();
    let agendaDiaSeleccionado = fechaHoyEnPeru();

    function formatearFechaAgenda(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    function formatearMesDisplay(date) {
        const texto = new Intl.DateTimeFormat('es-ES', {
            month: 'long',
            year: 'numeric'
        }).format(date);
        return texto.charAt(0).toUpperCase() + texto.slice(1);
    }

    function fechaHoyEnPeru() {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Lima',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).formatToParts(new Date());
        const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
        return `${values.year}-${values.month}-${values.day}`;
    }

    function ticketsActivosProgramados(fecha) {
        return window.allTickets.filter(ticket =>
            ticket.fecha_programada_iso === fecha &&
            !['Solucionado', 'Cerrado'].includes(ticket.estado)
        );
    }

    function renderCalendarioProgramacion() {
        if (rol !== 'admin') return;
        const calendar = document.getElementById('agendaCalendario');
        const selectedList = document.getElementById('agendaTicketsDia');
        const monthTitle = document.getElementById('agendaMesActual');
        if (!calendar || !selectedList || !monthTitle) return;

        monthTitle.textContent = agendaMesActual.toLocaleDateString('es-PE', {
            month: 'long',
            year: 'numeric',
            timeZone: 'America/Lima'
        });

        const headers = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
        const headerHTML = headers.map(day => `
            <div style="padding:6px 2px; text-align:center; color:var(--text-secondary); font-size:0.75rem; font-weight:600;">${day}</div>
        `).join('');

        const firstDay = new Date(agendaMesActual.getFullYear(), agendaMesActual.getMonth(), 1);
        const startOffset = (firstDay.getDay() + 6) % 7;
        const calendarStart = new Date(firstDay);
        calendarStart.setDate(firstDay.getDate() - startOffset);
        const today = fechaHoyEnPeru();
        let daysHTML = '';

        for (let index = 0; index < 42; index += 1) {
            const date = new Date(calendarStart);
            date.setDate(calendarStart.getDate() + index);
            const dateKey = formatearFechaAgenda(date);
            const count = ticketsActivosProgramados(dateKey).length;
            const isOtherMonth = date.getMonth() !== agendaMesActual.getMonth();
            const isSelected = dateKey === agendaDiaSeleccionado;
            const isPast = dateKey < today;
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
            const countColor = count ? '#0b3f8a' : 'var(--text-secondary)';

            daysHTML += `
                <button type="button" data-agenda-date="${dateKey}" aria-pressed="${isSelected}"
                    style="min-width:0; min-height:76px; padding:8px; text-align:left; border:1px solid ${isSelected ? 'var(--action-primary)' : 'var(--border-color)'}; border-radius:6px; background:${isSelected ? 'var(--bg-surface-hover)' : 'var(--bg-main)'}; opacity:${isOtherMonth ? '0.45' : '1'}; cursor:pointer;">
                    <span style="display:block; font-weight:600;">${date.getDate()}</span>
                    <span style="display:block; margin-top:8px; font-size:0.72rem; color:${countColor};">${count} ticket${count === 1 ? '' : 's'}</span>
                    <span style="display:block; font-size:0.68rem; color:var(--text-secondary);">${isWeekend ? 'No laborable' : isPast ? 'Pasado' : 'Sin límite diario'}</span>
                </button>
            `;
        }

        calendar.innerHTML = headerHTML + daysHTML;
        const selectedTickets = ticketsActivosProgramados(agendaDiaSeleccionado);
        const selectedDate = new Date(`${agendaDiaSeleccionado}T12:00:00`);
        const selectedLabel = selectedDate.toLocaleDateString('es-PE', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });

        selectedList.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:10px;">
                <strong style="text-transform:capitalize;">${escapeHTML(selectedLabel)}</strong>
                <span style="color:var(--text-secondary); font-size:0.85rem;">${selectedTickets.length} ticket${selectedTickets.length === 1 ? '' : 's'} activos · sin límite diario</span>
            </div>
            ${selectedTickets.length ? selectedTickets.map(ticket => `
                <button type="button" data-agenda-ticket="${ticket.id}" style="width:100%; display:flex; justify-content:space-between; align-items:center; gap:12px; padding:10px 12px; border:1px solid var(--border-color); border-radius:6px; background:var(--bg-main); color:var(--text-primary); text-align:left; cursor:pointer; margin-top:8px;">
                    <span style="min-width:0;"><strong>#${ticket.id}</strong> ${escapeHTML(ticket.titulo)}</span>
                    <span class="t-priority ${getPrioridadClass(ticket.prioridad)}">${escapeHTML(ticket.prioridad)}</span>
                </button>
            `).join('') : '<p style="margin:0; color:var(--text-secondary); font-size:0.88rem;">No hay tickets programados para esta fecha.</p>'}
        `;
    }

    window.moverMesAgenda = (offset) => {
        agendaMesActual = new Date(agendaMesActual.getFullYear(), agendaMesActual.getMonth() + offset, 1);
        renderCalendarioProgramacion();
    };

    document.getElementById('agendaCalendario')?.addEventListener('click', event => {
        const dayButton = event.target.closest('[data-agenda-date]');
        if (!dayButton) return;
        agendaDiaSeleccionado = dayButton.dataset.agendaDate;
        const [year, month, day] = agendaDiaSeleccionado.split('-').map(Number);
        agendaMesActual = new Date(year, month - 1, 1);
        renderCalendarioProgramacion();
    });

    document.getElementById('agendaTicketsDia')?.addEventListener('click', event => {
        const ticketButton = event.target.closest('[data-agenda-ticket]');
        if (!ticketButton) return;
        const ticket = window.allTickets.find(item => Number(item.id) === Number(ticketButton.dataset.agendaTicket));
        if (ticket) window.mostrarDetalleTicket(ticket);
    });

    async function obtenerTickets() {
        mostrarLoading(true);
        try {
            const res = await fetch('http://localhost:3000/api/tickets', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) throw new Error('Error al obtener tickets');

            const tickets = await res.json();
            window.allTickets = tickets;
            window.dispatchEvent(new CustomEvent('tickets:loaded', { detail: tickets }));
            mostrarTickets(tickets);
            actualizarDashboardKPIs(tickets);
            renderCalendarioProgramacion();
        } catch (err) {
            mostrarMensaje(err.message, "error");
        } finally {
            mostrarLoading(false);
        }
    }

    function mostrarTickets(tickets) {
        const lista = document.getElementById('tickets');
        if (!lista) return;
        lista.innerHTML = '';

        const rol = localStorage.getItem('rol');
        let estadoFiltro = window.estadoFiltroActual || '';

        let ticketsMostrados = tickets;
        if (estadoFiltro === 'activos') {
            ticketsMostrados = tickets.filter(t => !['Solucionado', 'Cerrado'].includes(t.estado));
        } else if (estadoFiltro === 'finalizados') {
            ticketsMostrados = tickets.filter(t => ['Solucionado', 'Cerrado'].includes(t.estado));
        } else if (estadoFiltro && estadoFiltro !== 'todos') {
            ticketsMostrados = tickets.filter(t => t.estado === estadoFiltro);
        }

        // Estado vacío cuando no hay tickets
        if (ticketsMostrados.length === 0) {
            lista.innerHTML = `
                <div style="text-align:center; padding:60px 20px; color:var(--text-secondary);">
                    <i class="ph ph-ticket" style="font-size:3rem; display:block; margin-bottom:12px; color:#d1d5db;"></i>
                    <p style="margin:0 0 4px 0; font-size:1rem; font-weight:500;">No hay tickets ${estadoFiltro ? 'con estado "' + estadoFiltro + '"' : 'aún'}</p>
                    <p style="margin:0; font-size:0.85rem;">Los tickets que crees aparecerán aquí</p>
                </div>
            `;
            return;
        }

        ticketsMostrados.forEach(ticket => {
            const div = document.createElement('div');
            div.className = 'ticket-row';
            
            // Click en ticket para detalle
            div.onclick = (e) => {
                if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT') {
                    mostrarDetalleTicket(ticket);
                }
            };
            div.style.cursor = 'pointer';

            let acciones = '';
            if (rol === 'admin') {
                acciones = `
                    <button class="btn-action-icon success" onclick="event.stopPropagation(); resolverTicket(${ticket.id})" title="Resolver">
                        <i class="ph ph-check"></i>
                    </button>
                    <button class="btn-action-icon danger" onclick="event.stopPropagation(); confirmarEliminar(${ticket.id})" title="Eliminar">
                        <i class="ph ph-trash"></i>
                    </button>
                    <button class="btn-action-icon" onclick="event.stopPropagation(); editarTicket(${JSON.stringify(ticket).replace(/"/g, '&quot;')})" title="Editar">
                        <i class="ph ph-pencil-simple"></i>
                    </button>
                    <button class="btn-action-icon" onclick="event.stopPropagation(); mostrarComentarios(${ticket.id})" title="Notas">
                        <i class="ph ph-note-pencil"></i>
                    </button>
                `;
            } else {
                acciones = '';
            }

            const fechaFormat = ticket.fecha_creacion ? new Date(ticket.fecha_creacion).toLocaleDateString() : 'N/A';
            const estadoClase = getEstadoClass(ticket.estado);

            div.innerHTML = `
                <div class="col-checkbox"><input type="checkbox"></div>
                <div class="col-id t-id">#${ticket.id}</div>
                <div class="col-date">${fechaFormat}</div>
                <div class="col-name">${escapeHTML(ticket.solicitante_nombre || ticket.username || 'N/A')}</div>
                <div class="col-subject t-subject"><i class="ph-fill ph-user"></i> ${escapeHTML(ticket.titulo)}
                    <small style="display:block; margin:4px 0 0 20px; color:var(--text-secondary);">${escapeHTML(ticket.oficina_nombre || 'Sin oficina')} · ${escapeHTML(ticket.categoria_nombre || 'Sin categoría')}</small>
                    ${ticket.bloque && ticket.ambiente
                        ? `<small style="display:block; margin:4px 0 0 20px; color:var(--text-secondary);">${escapeHTML(ticket.bloque)} · ${escapeHTML(ticket.ambiente)}${ticket.aula ? ` · Aula ${escapeHTML(ticket.aula)}` : ''}</small>`
                        : ticket.carrera ? `<small style="display:block; margin:4px 0 0 20px; color:var(--text-secondary);">Carrera: ${escapeHTML(ticket.carrera)}</small>` : ''}
                    ${ticket.asignatura_area ? `<small style="display:block; margin:4px 0 0 20px; color:var(--text-secondary);">Asignatura / área: ${escapeHTML(ticket.asignatura_area)}</small>` : ''}
                    <small style="display:block; margin:4px 0 0 20px; color:${getSlaStatus(ticket) === 'SLA vencido' ? '#dc2626' : 'var(--text-secondary)'};">${escapeHTML(getSlaStatus(ticket))}</small>
                    ${ticket.fecha_programada_iso ? `<small style="display:block; margin:4px 0 0 20px; color:var(--text-secondary);">Solución prevista: ${escapeHTML(new Date(`${ticket.fecha_programada_iso}T12:00:00`).toLocaleDateString('es-PE'))}</small>` : ''}
                </div>
                <div class="col-status t-status ${estadoClase}">${escapeHTML(ticket.estado)}</div>
                <div class="col-replier">${escapeHTML(ticket.tecnico || '-')}</div>
                <div class="col-priority t-priority ${getPrioridadClass(ticket.prioridad)}">
                    <i class="ph-fill ph-flag"></i> ${escapeHTML(ticket.prioridad)}
                </div>
                <div class="ticket-actions">${acciones}</div>
            `;

            lista.appendChild(div);
        });
    }

    window.mostrarDetalleTicket = (ticket) => {
        const detalle = document.getElementById('ticketDetalle');
        if (!detalle) return;

        const prioClass = getPrioridadClass(ticket.prioridad);
        const estadoClass = getEstadoClass(ticket.estado);
        const fechaProgramada = String(ticket.fecha_programada_iso || '').slice(0, 10);
        const esTicketFinalizado = ['Solucionado', 'Cerrado'].includes(ticket.estado);
        const diagnosticoHTML = rol === 'admin' ? `
            <div style="margin-top:24px; border-top:1px solid var(--border-color); padding-top:24px;">
                <h4 style="margin:0 0 12px; font-size:1rem; display:flex; align-items:center; gap:8px;">
                    <i class="ph ph-stethoscope"></i> Diagnóstico técnico
                </h4>
                <form id="diagnosticoForm" data-ticket-id="${ticket.id}" style="display:flex; flex-direction:column; gap:10px;">
                    <textarea id="diagnosticoCausa" class="modal-textarea" placeholder="Causa probable" maxlength="3000" style="margin:0; min-height:72px;"></textarea>
                    <textarea id="diagnosticoPruebas" class="modal-textarea" placeholder="Pruebas realizadas" maxlength="3000" style="margin:0; min-height:72px;"></textarea>
                    <textarea id="diagnosticoSolucion" class="modal-textarea" placeholder="Solución aplicada" maxlength="3000" style="margin:0; min-height:72px;"></textarea>
                    <textarea id="diagnosticoRecomendaciones" class="modal-textarea" placeholder="Recomendaciones" maxlength="3000" style="margin:0; min-height:72px;"></textarea>
                    <button type="submit" class="btn-primary" style="align-self:flex-start;"><i class="ph ph-floppy-disk"></i> Guardar diagnóstico</button>
                </form>
                <small id="diagnosticoMeta" style="display:block; margin-top:8px; color:var(--text-secondary);"></small>
            </div>
        ` : `
            <div style="margin-top:24px; border-top:1px solid var(--border-color); padding-top:24px;">
                <h4 style="margin:0 0 12px; font-size:1rem; display:flex; align-items:center; gap:8px;">
                    <i class="ph ph-stethoscope"></i> Diagnóstico técnico
                </h4>
                <div id="diagnosticoConsulta" style="color:var(--text-secondary); font-size:0.9rem;">Cargando diagnóstico...</div>
            </div>
        `;
        const programacionHTML = rol === 'admin' && !esTicketFinalizado ? `
            <div style="margin-top:24px; border-top:1px solid var(--border-color); padding-top:24px;">
                <h4 style="margin:0 0 12px; font-size:1rem;">Programar solución</h4>
                <form id="programarTicketForm" data-ticket-id="${ticket.id}" style="display:flex; align-items:end; gap:10px; flex-wrap:wrap;">
                    <div class="form-group" style="margin:0;">
                        <label for="fechaProgramada" style="display:block; margin-bottom:6px; font-size:0.82rem; color:var(--text-secondary);">Fecha prevista</label>
                        <input id="fechaProgramada" type="date" class="modal-input" min="${fechaHoyEnPeru()}" value="${escapeHTML(fechaProgramada)}" style="margin:0;">
                    </div>
                    <button type="submit" class="btn-primary"><i class="ph ph-calendar-check"></i> Guardar fecha</button>
                    ${fechaProgramada ? '<button type="button" class="btn-small" data-clear-schedule>Quitar programación</button>' : ''}
                    <small id="programacionDisponibilidad" style="flex-basis:100%; color:var(--text-secondary);">Cantidad ilimitada de tickets por día.</small>
                </form>
            </div>
        ` : '';

        // Para usuarios normales: mostrar comentarios integrados en el detalle
        const comentariosHTML = rol !== 'admin' ? `
            <div style="margin-top:24px; border-top:1px solid var(--border-color); padding-top:24px;">
                <h4 style="margin:0 0 16px 0; font-size:1rem; font-weight:600; display:flex; align-items:center; gap:8px;">
                    <i class="ph ph-chat-dots" style="color:var(--text-secondary);"></i> Comentarios y Notas
                </h4>
                <div id="detalleComentarios" style="max-height:200px; overflow-y:auto; margin-bottom:16px; display:flex; flex-direction:column; gap:8px;">
                    <p style="color:var(--text-secondary); font-size:0.85rem; text-align:center;">Cargando comentarios...</p>
                </div>
                <div style="display:flex; gap:8px;">
                    <textarea id="detalleNuevoComentario" placeholder="Escribe un comentario..." style="flex:1; padding:10px 14px; border:1px solid var(--border-color); border-radius:8px; font-family:inherit; font-size:0.9rem; resize:none; height:44px; box-sizing:border-box; background:#f9fafb;"></textarea>
                    <button class="btn-primary" onclick="agregarComentarioDesdeDetalle(${ticket.id})" style="white-space:nowrap; height:44px;">
                        <i class="ph ph-paper-plane-right"></i>
                    </button>
                </div>
            </div>
        ` : '';

        detalle.innerHTML = `
            <div class="detalle-contenido" style="padding: 10px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:16px;">
                    <h3 style="margin: 0; font-size: 1.5rem; font-weight: 600;">${escapeHTML(ticket.titulo)}</h3>
                    <button class="close-btn" onclick="cerrarDetalle()" style="background:none; border:none; font-size:1.25rem; cursor:pointer; color:var(--text-secondary); padding:4px;"><i class="ph ph-x"></i></button>
                </div>
                <div style="display:flex; gap:12px; margin-bottom: 24px; flex-wrap: wrap;">
                    <span class="t-priority ${prioClass}" style="display:inline-flex; align-items:center; gap:6px; padding:4px 8px; border-radius:6px; font-size:0.8rem; font-weight:500;">
                        <i class="ph-fill ph-flag"></i> ${escapeHTML(ticket.prioridad)}
                    </span>
                    <span class="t-status ${estadoClass}" style="display:inline-flex; align-items:center; padding:4px 8px; border-radius:6px; font-size:0.8rem; font-weight:500;">
                        ${escapeHTML(ticket.estado)}
                    </span>
                    <span style="display:inline-flex; align-items:center; gap:6px; padding:4px 8px; border-radius:6px; background:var(--bg-surface-hover); color:var(--text-secondary); font-size:0.8rem;">
                        <i class="ph-fill ph-user"></i> ${escapeHTML(ticket.solicitante_nombre || ticket.username || 'Usuario')}
                    </span>
                </div>

                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:12px; margin-bottom:16px; color:var(--text-secondary); font-size:0.9rem;">
                    <div><strong>Oficina:</strong> ${escapeHTML(ticket.oficina_nombre || 'Sin clasificar')}</div>
                    <div><strong>Categoría:</strong> ${escapeHTML(ticket.categoria_nombre || 'Sin clasificar')}</div>
                    ${ticket.carrera ? `<div><strong>Carrera:</strong> ${escapeHTML(ticket.carrera)}</div>` : ''}
                    ${ticket.bloque && ticket.ambiente ? `<div><strong>Bloque:</strong> ${escapeHTML(ticket.bloque)}<br><strong>Ambiente:</strong> ${escapeHTML(ticket.ambiente)}${ticket.aula ? `<br><strong>Aula:</strong> ${escapeHTML(ticket.aula)}` : ''}</div>` : ''}
                    ${ticket.asignatura_area ? `<div><strong>Asignatura / área:</strong> ${escapeHTML(ticket.asignatura_area)}</div>` : ''}
                    <div><strong>Solicitante:</strong> ${escapeHTML(ticket.solicitante_nombre || ticket.username || 'No registrado')}</div>
                    <div><strong>Código / DNI:</strong> ${escapeHTML(ticket.codigo_universitario_dni || 'No registrado')}</div>
                    <div><strong>Tipo:</strong> ${escapeHTML(ticket.tipo_solicitante || 'No especificado')}</div>
                    <div><strong>Ubicación:</strong> ${escapeHTML(ticket.ubicacion || 'No especificada')}</div>
                </div>

                <div style="background:var(--bg-main); padding:14px 16px; border-radius:8px; border:1px solid var(--border-color); margin-bottom:16px; font-size:0.88rem; line-height:1.6;">
                    <h4 style="margin:0 0 8px; font-size:0.95rem;">Acuerdos de nivel de servicio</h4>
                    ${getSlaDetailsHTML(ticket)}
                </div>
                
                <div style="background:var(--bg-main); padding:16px; border-radius:8px; border:1px solid var(--border-color); min-height:80px;">
                    <p style="margin:0; font-size:0.95rem; color:var(--text-primary); line-height:1.5;">
                        ${ticket.descripcion ? escapeHTML(ticket.descripcion) : '<em style="color:var(--text-secondary);">Sin descripción</em>'}
                    </p>
                </div>

                ${diagnosticoHTML}

                <div style="margin-top:24px; border-top:1px solid var(--border-color); padding-top:24px;">
                    <h4 style="margin:0 0 16px 0; font-size:1rem; font-weight:600; display:flex; align-items:center; gap:8px;">
                        <i class="ph ph-clock-counter-clockwise" style="color:var(--text-secondary);"></i> Historial del ticket
                    </h4>
                    <div id="ticketHistorial" style="max-height:220px; overflow-y:auto; display:flex; flex-direction:column; gap:10px;">
                        <p style="margin:0; color:var(--text-secondary); font-size:0.85rem;">Cargando historial...</p>
                    </div>
                </div>

                <div style="margin-top:24px; border-top:1px solid var(--border-color); padding-top:24px;">
                    <h4 style="margin:0 0 12px 0; font-size:1rem; font-weight:600; display:flex; align-items:center; gap:8px;">
                        <i class="ph ph-paperclip" style="color:var(--text-secondary);"></i> Evidencias adjuntas
                    </h4>
                    <form id="adjuntoForm" data-ticket-id="${ticket.id}" style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:12px;">
                        <input id="adjuntoArchivo" name="archivo" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required style="max-width:100%;">
                        <button type="submit" class="btn-primary"><i class="ph ph-upload-simple"></i> Adjuntar</button>
                        <small style="color:var(--text-secondary);">JPG, PNG, WEBP o PDF, máximo 10 MB</small>
                    </form>
                    <div id="ticketAdjuntos" style="display:flex; flex-direction:column; gap:8px;">
                        <p style="margin:0; color:var(--text-secondary); font-size:0.85rem;">Cargando evidencias...</p>
                    </div>
                </div>

                ${programacionHTML}

                ${comentariosHTML}
            
                <div style="display:flex; justify-content:${rol === 'admin' ? 'space-between' : 'flex-end'}; align-items:flex-end; margin-top:24px; border-top:1px solid var(--border-color); padding-top:24px;">
                    ${rol === 'admin' ? `
                    <div>
                        <label style="display:block; font-size:0.8rem; font-weight:500; color:var(--text-secondary); margin-bottom:8px;">Asignar Técnico</label>
                        <select id="tecnicoAsignar" class="modal-input" style="min-width:200px; margin:0;">
                            <option value="">Seleccionar técnico</option>
                        </select>
                    </div>` : ''}
                    <div style="display:flex; gap:12px;">
                        ${rol === 'admin' ? `<button class="btn-primary" onclick="asignarTecnico(${ticket.id})">Asignar</button>` : ''}
                        <button class="btn-small" onclick="cerrarDetalle()">Cerrar</button>
                    </div>
                </div>
            </div>
        `;
        detalle.style.display = 'block';
        document.getElementById('overlay').style.display = 'block';
        
        // Cargar técnicos y seleccionar el actual (admin)
        if (rol === 'admin') {
            fetch('http://localhost:3000/api/tecnicos')
                .then(res => res.json())
                .then(tecnicos => {
                    const select = document.getElementById('tecnicoAsignar');
                    if (!select) return;
                    tecnicos.forEach(t => {
                        const option = document.createElement('option');
                        option.value = t.id;
                        option.textContent = t.nombre;
                        if (t.id == ticket.tecnico_id) option.selected = true;
                        select.appendChild(option);
                    });
                });
        }

        // Cargar comentarios en el detalle (para usuarios)
        if (rol !== 'admin') {
            cargarComentariosDetalle(ticket.id);
            cargarHistorialTicket(ticket.id);
        }

        if (rol === 'admin') {
            cargarHistorialTicket(ticket.id);
        }
        cargarAdjuntosTicket(ticket.id);
        cargarDiagnosticoTicket(ticket.id);
        if (rol === 'admin' && !esTicketFinalizado && fechaProgramada) {
            actualizarDisponibilidadProgramacion(ticket.id, fechaProgramada);
        }
    };

    async function cargarDiagnosticoTicket(ticketId) {
        try {
            const res = await fetch(`http://localhost:3000/api/diagnosticos/${ticketId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const diagnostico = await res.json();
            if (!res.ok) throw new Error(diagnostico.error || 'No se pudo cargar el diagnóstico');

            if (rol === 'admin') {
                const fields = {
                    diagnosticoCausa: diagnostico?.causa_probable || '',
                    diagnosticoPruebas: diagnostico?.pruebas_realizadas || '',
                    diagnosticoSolucion: diagnostico?.solucion_aplicada || '',
                    diagnosticoRecomendaciones: diagnostico?.recomendaciones || ''
                };
                Object.entries(fields).forEach(([id, value]) => {
                    const field = document.getElementById(id);
                    if (field) field.value = value;
                });
                const meta = document.getElementById('diagnosticoMeta');
                if (meta && diagnostico) {
                    meta.textContent = `Última actualización: ${new Date(diagnostico.updated_at).toLocaleString()}${diagnostico.tecnico_nombre ? ` por ${diagnostico.tecnico_nombre}` : ''}`;
                }
                return;
            }

            const container = document.getElementById('diagnosticoConsulta');
            if (!container) return;
            if (!diagnostico) {
                container.textContent = 'Aún no hay diagnóstico técnico registrado.';
                return;
            }
            const rows = [
                ['Causa probable', diagnostico.causa_probable],
                ['Pruebas realizadas', diagnostico.pruebas_realizadas],
                ['Solución aplicada', diagnostico.solucion_aplicada],
                ['Recomendaciones', diagnostico.recomendaciones]
            ].filter(([, value]) => value);
            container.innerHTML = rows.length
                ? rows.map(([label, value]) => `<p style="margin:0 0 10px;"><strong>${label}:</strong><br>${escapeHTML(value)}</p>`).join('')
                : 'Aún no hay diagnóstico técnico registrado.';
        } catch (err) {
            const container = document.getElementById('diagnosticoConsulta');
            if (container) container.textContent = err.message;
        }
    }

    document.getElementById('ticketDetalle')?.addEventListener('submit', async event => {
        if (event.target.id !== 'diagnosticoForm') return;
        event.preventDefault();
        const form = event.target;
        const payload = {
            causa_probable: document.getElementById('diagnosticoCausa').value,
            pruebas_realizadas: document.getElementById('diagnosticoPruebas').value,
            solucion_aplicada: document.getElementById('diagnosticoSolucion').value,
            recomendaciones: document.getElementById('diagnosticoRecomendaciones').value
        };
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
            const res = await fetch(`http://localhost:3000/api/diagnosticos/${form.dataset.ticketId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'No se pudo guardar el diagnóstico');
            mostrarMensaje(data.mensaje, 'exito');
            await cargarDiagnosticoTicket(form.dataset.ticketId);
        } catch (err) {
            mostrarMensaje(err.message, 'error');
        } finally {
            button.disabled = false;
        }
    });

    function actualizarDisponibilidadProgramacion(ticketId, fecha) {
        const message = document.getElementById('programacionDisponibilidad');
        if (!message || !fecha) return;
        const selectedDate = new Date(`${fecha}T12:00:00`);
        if ([0, 6].includes(selectedDate.getDay())) {
            message.textContent = 'La programación solo está disponible de lunes a viernes.';
            message.style.color = '#dc2626';
            return;
        }
        const count = ticketsActivosProgramados(fecha).filter(ticket => Number(ticket.id) !== Number(ticketId)).length;
        message.textContent = `${count} ticket${count === 1 ? '' : 's'} activo${count === 1 ? '' : 's'} para esta fecha. No hay límite diario.`;
        message.style.color = 'var(--text-secondary)';
    }

    document.getElementById('ticketDetalle')?.addEventListener('change', event => {
        if (event.target.id !== 'fechaProgramada') return;
        const form = event.target.closest('#programarTicketForm');
        actualizarDisponibilidadProgramacion(form.dataset.ticketId, event.target.value);
    });

    document.getElementById('ticketDetalle')?.addEventListener('submit', async event => {
        if (event.target.id !== 'programarTicketForm') return;
        event.preventDefault();
        await guardarFechaProgramada(event.target, event.target.querySelector('#fechaProgramada').value);
    });

    document.getElementById('ticketDetalle')?.addEventListener('click', async event => {
        const clearButton = event.target.closest('[data-clear-schedule]');
        if (!clearButton) return;
        const form = clearButton.closest('#programarTicketForm');
        await guardarFechaProgramada(form, null);
    });

    async function guardarFechaProgramada(form, fecha) {
        try {
            const res = await fetch(`http://localhost:3000/api/tickets/${form.dataset.ticketId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ fecha_programada: fecha })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'No se pudo guardar la programación');

            mostrarMensaje(fecha ? 'Solución programada correctamente' : 'Programación eliminada', 'exito');
            await obtenerTickets();
            const updatedTicket = window.allTickets.find(ticket => Number(ticket.id) === Number(form.dataset.ticketId));
            if (updatedTicket) window.mostrarDetalleTicket(updatedTicket);
        } catch (err) {
            mostrarMensaje(err.message, 'error');
        }
    }

    async function cargarAdjuntosTicket(ticketId) {
        const contenedor = document.getElementById('ticketAdjuntos');
        if (!contenedor) return;

        try {
            const res = await fetch(`http://localhost:3000/api/adjuntos/${ticketId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const adjuntos = await res.json();
            if (!res.ok) throw new Error(adjuntos.error || 'No se pudieron cargar las evidencias');

            if (!adjuntos.length) {
                contenedor.innerHTML = '<p style="margin:0; color:var(--text-secondary); font-size:0.85rem;">Todavía no hay evidencias adjuntas.</p>';
                return;
            }

            contenedor.innerHTML = adjuntos.map(adjunto => `
                <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; padding:10px 12px; border:1px solid var(--border-color); border-radius:8px;">
                    <div style="min-width:0;">
                        <strong style="display:block; overflow-wrap:anywhere; font-size:0.9rem;">${escapeHTML(adjunto.nombre_original)}</strong>
                        <small style="color:var(--text-secondary);">${(Number(adjunto.tamano_bytes) / 1024 / 1024).toFixed(2)} MB · ${new Date(adjunto.created_at).toLocaleString()}</small>
                    </div>
                    <button type="button" class="btn-small" data-download-attachment="${adjunto.id}" data-ticket-id="${ticketId}" data-file-name="${escapeHTML(adjunto.nombre_original)}" title="Descargar evidencia">
                        <i class="ph ph-download-simple"></i>
                    </button>
                </div>
            `).join('');
        } catch (err) {
            contenedor.innerHTML = `<p style="margin:0; color:#ef4444; font-size:0.85rem;">${escapeHTML(err.message)}</p>`;
        }
    }

    document.getElementById('ticketDetalle')?.addEventListener('submit', async (event) => {
        if (event.target.id !== 'adjuntoForm') return;
        event.preventDefault();

        const form = event.target;
        const fileInput = form.querySelector('input[type="file"]');
        if (!fileInput.files.length) return;

        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
            const formData = new FormData();
            formData.append('archivo', fileInput.files[0]);
            const res = await fetch(`http://localhost:3000/api/adjuntos/${form.dataset.ticketId}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'No se pudo adjuntar el archivo');

            form.reset();
            mostrarMensaje(data.mensaje || 'Evidencia adjuntada correctamente', 'exito');
            await cargarAdjuntosTicket(form.dataset.ticketId);
        } catch (err) {
            mostrarMensaje(err.message, 'error');
        } finally {
            button.disabled = false;
        }
    });

    document.getElementById('ticketDetalle')?.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-download-attachment]');
        if (!button) return;

        try {
            const { ticketId, downloadAttachment, fileName } = button.dataset;
            const res = await fetch(`http://localhost:3000/api/adjuntos/${ticketId}/${downloadAttachment}/descargar`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'No se pudo descargar la evidencia');
            }

            const objectUrl = URL.createObjectURL(await res.blob());
            const link = document.createElement('a');
            link.href = objectUrl;
            link.download = fileName;
            link.click();
            setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
        } catch (err) {
            mostrarMensaje(err.message, 'error');
        }
    });

    async function cargarHistorialTicket(ticketId) {
        try {
            const res = await fetch(`http://localhost:3000/api/tickets/${ticketId}/historial`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) return;

            const historial = await res.json();
            const contenedor = document.getElementById('ticketHistorial');
            if (!contenedor) return;

            if (!historial.length) {
                contenedor.innerHTML = '<p style="margin:0; color:var(--text-secondary); font-size:0.85rem;">Aún no hay cambios registrados en este ticket.</p>';
                return;
            }

            contenedor.innerHTML = historial.map(item => `
                <div style="padding:10px 12px; border:1px solid var(--border-color); border-radius:8px; background:var(--bg-main);">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:4px;">
                        <strong style="font-size:0.85rem;">${escapeHTML(item.accion || 'Actualización')}</strong>
                        <small style="color:var(--text-secondary);">${new Date(item.created_at).toLocaleString()}</small>
                    </div>
                    <div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:4px;">
                        ${item.username ? `Por: ${escapeHTML(item.username)}` : 'Sistema'}
                    </div>
                    <div style="font-size:0.9rem; color:var(--text-primary);">${escapeHTML(item.descripcion || 'Sin detalle')}</div>
                </div>
            `).join('');
        } catch (err) {
            // Silenciar errores del historial
        }
    }

    // Cargar comentarios directamente en el panel de detalle del ticket
    async function cargarComentariosDetalle(ticketId) {
        try {
            const res = await fetch(`http://localhost:3000/api/comentarios/${ticketId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const comentarios = await res.json();
            const lista = document.getElementById('detalleComentarios');
            if (!lista) return;
            lista.innerHTML = '';

            if (comentarios.length === 0) {
                lista.innerHTML = '<p style="color:var(--text-secondary); font-size:0.85rem; text-align:center; padding:16px 0;">No hay comentarios aún</p>';
                return;
            }

            comentarios.forEach(c => {
                const div = document.createElement('div');
                div.style.cssText = 'padding:10px 12px; background:var(--bg-main); border:1px solid var(--border-color); border-radius:8px;';
                div.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <span style="font-weight:600; font-size:0.85rem; color:var(--text-primary);">${c.username || 'Usuario'}</span>
                        <small style="color:var(--text-secondary); font-size:0.75rem;">${new Date(c.fecha).toLocaleString()}</small>
                    </div>
                    <p style="margin:0; font-size:0.9rem; color:var(--text-primary); line-height:1.4;">${c.comentario}</p>
                `;
                lista.appendChild(div);
            });
            // Scroll al último comentario
            lista.scrollTop = lista.scrollHeight;
        } catch (err) {
            // Silenciar error de carga de comentarios
        }
    }

    // Agregar comentario desde el panel de detalle
    window.agregarComentarioDesdeDetalle = async (ticketId) => {
        const input = document.getElementById('detalleNuevoComentario');
        const comentario = input?.value?.trim();
        if (!comentario) return;

        try {
            const res = await fetch('http://localhost:3000/api/comentarios', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ ticket_id: ticketId, comentario })
            });

            if (!res.ok) throw new Error('Error al agregar comentario');

            input.value = '';
            cargarComentariosDetalle(ticketId);
        } catch (err) {
            mostrarMensaje(err.message, 'error');
        }
    };

    window.editarTicket = (ticket) => {
        const editForm = document.getElementById('editarTicket');
        if (!editForm) return;

        document.getElementById('editTitulo').value = ticket.titulo;
        document.getElementById('editDescripcion').value = ticket.descripcion;
        document.getElementById('editEstado').value = ticket.estado;

        // Cargar técnicos
        fetch('http://localhost:3000/api/tecnicos')
            .then(res => res.json())
            .then(tecnicos => {
                const select = document.getElementById('editTecnico');
                select.innerHTML = '<option value="">Seleccionar tecnico</option>';
                tecnicos.forEach(t => {
                    const option = document.createElement('option');
                    option.value = t.id;
                    option.textContent = t.nombre;
                    if (t.id == ticket.tecnico_id) option.selected = true;
                    select.appendChild(option);
                });
            });

        editForm.style.display = 'block';
        document.getElementById('overlay').style.display = 'block';

        // Guardar cambios
        document.getElementById('editForm').onsubmit = async (e) => {
            e.preventDefault();
            
            const titulo = document.getElementById('editTitulo').value;
            const descripcion = document.getElementById('editDescripcion').value;
            const estado = document.getElementById('editEstado').value;
            const tecnico_id = document.getElementById('editTecnico').value;

            try {
                const res = await fetch(`http://localhost:3000/api/tickets/${ticket.id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ titulo, descripcion, estado, tecnico_id })
                });

                if (!res.ok) throw new Error('Error al editar ticket');
                
                cerrarEdicion();
                obtenerTickets();
            } catch (err) {
                mostrarMensaje(err.message, "error");
            }
        };
    };

    window.cerrarEdicion = () => {
        document.getElementById('editarTicket').style.display = 'none';
        document.getElementById('overlay').style.display = 'none';
    };

    window.asignarTecnico = async (ticketId) => {
        const tecnico_id = document.getElementById('tecnicoAsignar').value;
        if (!tecnico_id) {
            mostrarMensaje('Selecciona un técnico', "error");
            return;
        }

        try {
            const res = await fetch(`http://localhost:3000/api/tickets/${ticketId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ tecnico_id })
            });

            if (!res.ok) throw new Error('Error al asignar técnico');
            
            cerrarDetalle();
            obtenerTickets();
        } catch (err) {
            mostrarMensaje(err.message, "error");
        }
    };

    window.mostrarComentarios = async (ticketId) => {
        const section = document.getElementById('comentariosSection');
        section.style.display = 'block';
        document.getElementById('overlay').style.display = 'block';
        
        window.ticketIdComentario = ticketId;
        
        // Cargar comentarios
        const res = await fetch(`http://localhost:3000/api/comentarios/${ticketId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const comentarios = await res.json();
        const lista = document.getElementById('listaComentarios');
        lista.innerHTML = '';
        
        comentarios.forEach(c => {
            const div = document.createElement('div');
            div.style.cssText = 'border-bottom:1px solid #eee; padding:10px 0;';
            div.innerHTML = `
                <p><strong>${c.username || 'Usuario'}:</strong> ${c.comentario}</p>
                <small>${new Date(c.fecha).toLocaleString()}</small>
            `;
            lista.appendChild(div);
        });
    };
    
    window.agregarComentario = async () => {
        const comentario = document.getElementById('nuevoComentario').value;
        if (!comentario) return;
        
        try {
            const res = await fetch('http://localhost:3000/api/comentarios', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ ticket_id: window.ticketIdComentario, comentario })
            });
            
            if (!res.ok) throw new Error('Error al agregar comentario');
            
            mostrarComentarios(window.ticketIdComentario);
            document.getElementById('nuevoComentario').value = '';
        } catch (err) {
            mostrarMensaje(err.message, "error");
        }
    };
    
    window.cerrarComentarios = () => {
        document.getElementById('comentariosSection').style.display = 'none';
        document.getElementById('overlay').style.display = 'none';
    };

    window.cerrarDetalle = () => {
        document.getElementById('ticketDetalle').style.display = 'none';
        document.getElementById('overlay').style.display = 'none';
    };

    window.crearTicket = async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        mostrarLoading(true, btn);

        const titulo = document.getElementById('titulo').value;
        const descripcion = document.getElementById('descripcion').value;
        const impacto = document.getElementById('impacto').value;
        const urgencia = document.getElementById('urgencia').value;
        const bloque = document.getElementById('ticketBloque').value;
        const ambiente = document.getElementById('ticketAmbiente').value;
        const aulaInput = document.getElementById('ticketNumeroAula');
        const aula = aulaInput.value ? Number(aulaInput.value) : null;
        const ubicacion = [bloque, ambiente, aula ? `Aula ${aula}` : ''].filter(Boolean).join(' - ');
        const solicitante_nombre = document.getElementById('solicitanteNombre').value;
        const codigo_universitario_dni = document.getElementById('codigoUniversitarioDni').value;
        const tipo_solicitante = document.getElementById('tipoSolicitante').value;
        const carrera = document.getElementById('carreraTicket')?.value || '';
        const asignatura_area = document.getElementById('asignaturaArea')?.value.trim() || '';
        const tecnico_id = puedeAsignarTecnico ? document.getElementById('asignarTecnico').value : null;
        const fotoIncidencia = document.getElementById('fotoIncidencia').files[0];

        try {
            const { oficina_id, categoria_id } = await resolverCatalogoAmbiente(ambiente);
            const res = await fetch('/api/tickets', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    titulo,
                    descripcion,
                    impacto,
                    urgencia,
                    tecnico_id,
                    oficina_id,
                    categoria_id,
                    carrera,
                    bloque,
                    ambiente,
                    aula,
                    ubicacion,
                    solicitante_nombre,
                    codigo_universitario_dni,
                    tipo_solicitante,
                    asignatura_area
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al crear ticket');

            let fotoError = '';
            if (fotoIncidencia) {
                try {
                    const formData = new FormData();
                    formData.append('archivo', fotoIncidencia);
                    const uploadRes = await fetch(`http://localhost:3000/api/adjuntos/${data.ticketId}`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` },
                        body: formData
                    });
                    const uploadData = await uploadRes.json();
                    if (!uploadRes.ok) throw new Error(uploadData.error || 'No se pudo adjuntar la foto');
                } catch (err) {
                    fotoError = err.message;
                }
            }

            mostrarMensaje(
                fotoError ? `Ticket creado, pero no se guardó la foto: ${fotoError}` : 'Ticket creado correctamente',
                fotoError ? 'error' : 'exito'
            );
            await obtenerTickets();
            e.target.reset();
            sincronizarCampoAsignaturaDocente();
            document.getElementById('ticketBloque').dispatchEvent(new Event('change'));
            closeQuickTicket();
        } catch (err) {
            mostrarMensaje(err.message, "error");
        } finally {
            mostrarLoading(false, btn);
        }
    };

    window.resolverTicket = async (id) => {
        mostrarLoading(true);
        try {
            const res = await fetch(`http://localhost:3000/api/tickets/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ estado: 'Solucionado' })
            });

            if (!res.ok) throw new Error('Error al resolver ticket');
            mostrarMensaje('Ticket resuelto correctamente', 'exito');
            obtenerTickets();
            cargarNotificaciones();
        } catch (err) {
            mostrarMensaje(err.message, "error");
        } finally {
            mostrarLoading(false);
        }
    };

    // Modal de confirmación elegante (reemplaza confirm())
    window.confirmarEliminar = (id) => {
        const modal = document.getElementById('confirmModal');
        const overlay = document.getElementById('overlay');
        if (!modal) return;
        modal.style.display = 'block';
        overlay.style.display = 'block';

        document.getElementById('confirmAceptar').onclick = async () => {
            modal.style.display = 'none';
            overlay.style.display = 'none';
            await eliminarTicket(id);
        };
        document.getElementById('confirmCancelar').onclick = () => {
            modal.style.display = 'none';
            overlay.style.display = 'none';
        };
    };

    window.eliminarTicket = async (id) => {
        mostrarLoading(true);
        try {
            const res = await fetch(`http://localhost:3000/api/tickets/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) throw new Error('Error al eliminar ticket');
            mostrarMensaje('Ticket eliminado correctamente', 'exito');
            obtenerTickets();
        } catch (err) {
            mostrarMensaje(err.message, "error");
        } finally {
            mostrarLoading(false);
        }
    };

    async function cargarTecnicos() {
        if (!puedeAsignarTecnico) return;

        try {
            const res = await fetch('http://localhost:3000/api/tecnicos');
            if (!res.ok) throw new Error('Error al cargar técnicos');

            const tecnicos = await res.json();
            const select = document.getElementById('asignarTecnico');
            if (!select) return;

            tecnicos.forEach(t => {
                const option = document.createElement('option');
                option.value = t.id;
                option.textContent = t.nombre;
                select.appendChild(option);
            });
        } catch (err) {
            mostrarMensaje(err.message, "error");
        }
    }

    window.logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('rol');
        window.location.href = 'login.html';
    };

    window.estadoFiltroActual = '';
    window.paginaActual = 1;
    window.limitePorPagina = 10;
    window.totalPaginas = 1;

    window.filtrar = (estado, evt) => {
        window.estadoFiltroActual = estado === 'todos' ? '' : estado;
        window.paginaActual = 1;
        
        const target = evt ? evt.currentTarget : (event ? event.currentTarget : null);
        if (target) {
            document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
            target.classList.add('active');
        }
        
        aplicarFiltros();
    };

    window.cambiarPaginaTickets = (delta) => {
        const nuevaPagina = window.paginaActual + delta;
        if (nuevaPagina >= 1 && nuevaPagina <= window.totalPaginas) {
            window.paginaActual = nuevaPagina;
            aplicarFiltros();
        }
    };

    window.aplicarFiltros = async () => {
        const token = localStorage.getItem('token');
        if (typeof mostrarLoading === 'function') mostrarLoading(true);
        
        const estado = window.estadoFiltroActual;
        const busqueda = document.getElementById('searchInput')?.value || '';
        
        const params = new URLSearchParams({
            page: window.paginaActual,
            limit: window.limitePorPagina,
            paginated: 'true'
        });
        if (estado) params.append('estado', estado);
        if (busqueda.trim()) params.append('busqueda', busqueda.trim());
        
        try {
            const res = await fetch(`http://localhost:3000/api/tickets?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const responseData = await res.json();
            if (!res.ok) throw new Error(responseData.error || 'Error cargando tickets');

            const tickets = Array.isArray(responseData) ? responseData : (responseData.data || []);
            const total = responseData.total !== undefined ? responseData.total : tickets.length;
            window.totalPaginas = responseData.totalPages || Math.ceil(total / window.limitePorPagina) || 1;

            mostrarTickets(tickets);

            // Actualizar controles de paginación
            const infoEl = document.getElementById('paginacionInfo');
            const pageIndicatorEl = document.getElementById('pageIndicator');
            const btnPrev = document.getElementById('btnPrevPage');
            const btnNext = document.getElementById('btnNextPage');

            const inicio = total > 0 ? (window.paginaActual - 1) * window.limitePorPagina + 1 : 0;
            const fin = Math.min(total, window.paginaActual * window.limitePorPagina);

            if (infoEl) infoEl.textContent = `Mostrando ${inicio} - ${fin} de ${total} tickets`;
            if (pageIndicatorEl) pageIndicatorEl.textContent = `Página ${window.paginaActual} de ${window.totalPaginas}`;
            if (btnPrev) btnPrev.disabled = window.paginaActual <= 1;
            if (btnNext) btnNext.disabled = window.paginaActual >= window.totalPaginas;

        } catch (err) {
            if (typeof mostrarMensaje === 'function') mostrarMensaje(err.message, "error");
        } finally {
            if (typeof mostrarLoading === 'function') mostrarLoading(false);
        }
    };

    window.limpiarFiltros = () => {
        window.estadoFiltroActual = '';
        window.paginaActual = 1;
        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.value = '';
        aplicarFiltros();
    };

    // Escuchar búsqueda en tiempo real con debounce
    let searchTimeout = null;
    document.getElementById('searchInput')?.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            window.paginaActual = 1;
            aplicarFiltros();
        }, 300);
    });

    const tipoSolicitanteSelect = document.getElementById('tipoSolicitante');
    const asignaturaAreaGroup = document.getElementById('asignaturaAreaGroup');
    const asignaturaAreaInput = document.getElementById('asignaturaArea');

    function sincronizarCampoAsignaturaDocente() {
        const esDocente = tipoSolicitanteSelect?.value === 'docente';
        if (asignaturaAreaGroup) asignaturaAreaGroup.hidden = !esDocente;
        if (asignaturaAreaInput) {
            asignaturaAreaInput.required = Boolean(esDocente);
            if (!esDocente) asignaturaAreaInput.value = '';
        }
    }

    tipoSolicitanteSelect?.addEventListener('change', sincronizarCampoAsignaturaDocente);
    sincronizarCampoAsignaturaDocente();
    document.getElementById('formTicket')?.addEventListener('submit', crearTicket);

    // SPA Routing Logic
    window.cambiarVista = (viewId) => {
        document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
        
        const targetView = document.getElementById(`view-${viewId}`);
        if(targetView) {
            targetView.classList.add('active');
        } else {
            const placeholder = document.getElementById('view-placeholder');
            if(placeholder) placeholder.classList.add('active');
        }
        
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        const navItem = document.querySelector(`.nav-item[data-view="${viewId}"]`);
        if(navItem) navItem.classList.add('active');
    };

    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const viewId = item.getAttribute('data-view');
            cambiarVista(viewId);
        });
    });

    const quickTicketModal = document.getElementById('quickTicketModal');
    const quickTicketOverlay = document.getElementById('quickTicketOverlay');
    const agendaModal = document.getElementById('agendaModal');
    const agendaModalOverlay = document.getElementById('agendaModalOverlay');

    function setDialogOpen(dialog, overlay, isOpen, trigger) {
        if (!dialog || !overlay) return;
        dialog.style.display = isOpen ? 'block' : 'none';
        dialog.setAttribute('aria-hidden', String(!isOpen));
        overlay.style.display = isOpen ? 'block' : 'none';
        if (isOpen) dialog.focus();
        else trigger?.focus();
    }

    const quickTicketTrigger = document.getElementById('quickTicketOpen');
    const ticketBloque = document.getElementById('ticketBloque');
    const ticketAmbiente = document.getElementById('ticketAmbiente');
    const ticketNumeroAula = document.getElementById('ticketNumeroAula');
    const ticketNumeroAulaContainer = document.getElementById('ticketNumeroAulaContainer');

    function actualizarCampoNumeroAula() {
        const requiereNumeroAula = ticketAmbiente.value === 'Salones / Aulas';
        ticketNumeroAulaContainer.hidden = !requiereNumeroAula;
        ticketNumeroAula.required = requiereNumeroAula;
        if (!requiereNumeroAula) ticketNumeroAula.value = '';
    }

    ticketAmbiente.addEventListener('change', actualizarCampoNumeroAula);
    const ambientesPorBloque = {
        'Bloque A': [
            'Salones / Aulas',
            'Laboratorio de Agronomía y Ambiental',
            'Auditorio',
            'Centro de Cómputo'
        ],
        'Bloque B': [
            'Servicios Académicos',
            'Admisión',
            'Grados y Títulos',
            'Mesa de Partes',
            'Administración',
            'Subdirección de Derecho',
            'Subdirección de Agronomía, Ing. Ambiental e Ing. Civil',
            'Subdirección de Contabilidad y Educación',
            'Subdirección de Enfermería',
            'Tópico'
        ],
        'Bloque C': [
            'Sala de Docentes',
            'Salones / Aulas',
            'Biblioteca',
            'Laboratorio de Ingeniería Civil'
        ]
    };

    ticketBloque?.addEventListener('change', () => {
        const ambientes = ambientesPorBloque[ticketBloque.value] || [];
        ticketAmbiente.replaceChildren(new Option(
            ambientes.length ? 'Selecciona un ambiente...' : 'Primero selecciona un bloque...',
            ''
        ));
        ambientes.forEach(ambiente => ticketAmbiente.add(new Option(ambiente, ambiente)));
        ticketAmbiente.disabled = ambientes.length === 0;
        actualizarCampoNumeroAula();
    });

    quickTicketTrigger?.addEventListener('click', () => {
        const formTicket = document.getElementById('formTicket');
        formTicket?.reset();
        ticketBloque.value = '';
        ticketBloque.dispatchEvent(new Event('change'));
        sincronizarCampoAsignaturaDocente();
        setDialogOpen(quickTicketModal, quickTicketOverlay, true);
        document.getElementById('titulo')?.focus();
    });

    const closeQuickTicket = () => setDialogOpen(quickTicketModal, quickTicketOverlay, false, quickTicketTrigger);
    document.getElementById('quickTicketClose')?.addEventListener('click', closeQuickTicket);
    document.getElementById('quickTicketCancel')?.addEventListener('click', closeQuickTicket);
    quickTicketOverlay?.addEventListener('click', closeQuickTicket);

    const agendaTrigger = document.getElementById('openAgendaModal');
    agendaTrigger?.addEventListener('click', () => {
        setDialogOpen(agendaModal, agendaModalOverlay, true);
        renderCalendarioProgramacion();
    });
    const closeAgenda = () => setDialogOpen(agendaModal, agendaModalOverlay, false, agendaTrigger);
    document.getElementById('closeAgendaModal')?.addEventListener('click', closeAgenda);
    agendaModalOverlay?.addEventListener('click', closeAgenda);

    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        if (quickTicketModal?.style.display === 'block') closeQuickTicket();
        if (agendaModal?.style.display === 'block') closeAgenda();
    });

    // Admin user management
    function setOfficeSelectLoading(select, label = 'Cargando oficinas...') {
        if (!select) return;
        select.disabled = true;
        select.innerHTML = `<option value="">${label}</option>`;
    }

    function renderOfficeList(oficinas) {
        const list = document.getElementById('adminOficinasList');
        if (!list) return;

        if (!oficinas.length) {
            list.innerHTML = '<p style="margin:0; color:var(--text-secondary);">No hay oficinas registradas.</p>';
            return;
        }

        list.innerHTML = `
            <table style="width:100%; border-collapse:collapse; margin-top:12px; min-width:520px;">
                <thead>
                    <tr style="border-bottom:2px solid var(--border-color); color:var(--text-secondary); font-size:0.75rem; text-transform:uppercase; letter-spacing:0.05em;">
                        <th style="padding:10px 12px; text-align:left;">Código</th>
                        <th style="padding:10px 12px; text-align:left;">Nombre</th>
                        <th style="padding:10px 12px; text-align:left;">Estado</th>
                        <th style="padding:10px 12px; text-align:right;">Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    ${oficinas.map(oficina => `
                        <tr style="border-bottom:1px solid var(--border-color);">
                            <td style="padding:12px; font-weight:600;">${escapeHTML(oficina.codigo)}</td>
                            <td style="padding:12px;">
                                <div style="font-weight:600;">${escapeHTML(oficina.nombre)}</div>
                                ${oficina.descripcion ? `<div style="font-size:0.82rem; color:var(--text-secondary); margin-top:4px;">${escapeHTML(oficina.descripcion)}</div>` : ''}
                            </td>
                            <td style="padding:12px;">
                                <span style="display:inline-flex; padding:4px 8px; border-radius:6px; font-size:0.75rem; background:${oficina.activo === false ? '#fef2f2' : '#e0f2fe'}; color:${oficina.activo === false ? '#b91c1c' : '#0284c7'}; font-weight:600;">
                                    ${oficina.activo === false ? 'Inactiva' : 'Activa'}
                                </span>
                            </td>
                            <td style="padding:12px; text-align:right;">
                                <div style="display:flex; justify-content:flex-end; gap:8px; flex-wrap:wrap;">
                                    <button type="button" class="btn-small" data-office-action="edit" data-office-id="${oficina.id}">Editar</button>
                                    <button type="button" class="btn-small btn-danger" data-office-action="delete" data-office-id="${oficina.id}">Eliminar</button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    function renderCategoryList(categorias) {
        const list = document.getElementById('listaCategorías');
        if (!list) return;

        if (!categorias.length) {
            list.innerHTML = '<p style="margin:0; color:var(--text-secondary);">No hay categorías registradas en esta oficina.</p>';
            return;
        }

        list.innerHTML = `
            <table style="width:100%; border-collapse:collapse; margin-top:12px; min-width:520px;">
                <thead>
                    <tr style="border-bottom:2px solid var(--border-color); color:var(--text-secondary); font-size:0.75rem; text-transform:uppercase; letter-spacing:0.05em;">
                        <th style="padding:10px 12px; text-align:left;">Código</th>
                        <th style="padding:10px 12px; text-align:left;">Nombre</th>
                        <th style="padding:10px 12px; text-align:left;">Tipo</th>
                        <th style="padding:10px 12px; text-align:right;">Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    ${categorias.map(categoria => `
                        <tr style="border-bottom:1px solid var(--border-color);">
                            <td style="padding:12px; font-weight:600;">${escapeHTML(categoria.codigo)}</td>
                            <td style="padding:12px;">
                                <div style="font-weight:600;">${escapeHTML(categoria.nombre)}</div>
                                ${categoria.descripcion ? `<div style="font-size:0.82rem; color:var(--text-secondary); margin-top:4px;">${escapeHTML(categoria.descripcion)}</div>` : ''}
                            </td>
                            <td style="padding:12px;">
                                <span style="display:inline-flex; padding:4px 8px; border-radius:6px; font-size:0.75rem; background:${categoria.categoria_padre_id ? '#fef3c7' : '#e0f2fe'}; color:${categoria.categoria_padre_id ? '#d97706' : '#0284c7'}; font-weight:600;">
                                    ${categoria.categoria_padre_id ? 'Subcategoría' : 'Categoría raíz'}
                                </span>
                            </td>
                            <td style="padding:12px; text-align:right;">
                                <div style="display:flex; justify-content:flex-end; gap:8px; flex-wrap:wrap;">
                                    <button type="button" class="btn-small" data-category-action="edit" data-category-id="${categoria.id}">Editar</button>
                                    <button type="button" class="btn-small btn-danger" data-category-action="delete" data-category-id="${categoria.id}">Eliminar</button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    }

    async function cargarUsuariosAdmin() {
        if (rol !== 'admin') return;

        const tbody = document.getElementById('adminUsuariosBody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="7" style="padding:20px; text-align:center; color:var(--text-secondary);">Cargando usuarios...</td></tr>';
        }

        try {
            const res = await fetch('http://localhost:3000/api/auth/usuarios', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) throw new Error('No se pudieron cargar los usuarios');
            const usuarios = await res.json();

            if (!tbody) return;

            if (!usuarios.length) {
                tbody.innerHTML = '<tr><td colspan="7" style="padding:20px; text-align:center; color:var(--text-secondary);">No hay usuarios registrados.</td></tr>';
                return;
            }

            const totalAdmins = usuarios.filter(u => u.rol === 'admin').length;
            const totalClientes = usuarios.filter(u => u.rol !== 'admin').length;

            const adminTotal = document.getElementById('admin-total-usuarios');
            const adminAdmins = document.getElementById('admin-total-admins');
            const adminClientes = document.getElementById('admin-total-clientes');
            if (adminTotal) adminTotal.textContent = usuarios.length;
            if (adminAdmins) adminAdmins.textContent = totalAdmins;
            if (adminClientes) adminClientes.textContent = totalClientes;

            tbody.innerHTML = usuarios.map(usuario => {
                const esAdminProtegido = Boolean(usuario.is_protected_admin);
                const acciones = esAdminProtegido
                    ? '<span style="color:var(--text-secondary); font-size:0.85rem;">Cuenta principal protegida</span>'
                    : usuario.rol === 'admin'
                        ? `<button class="btn-small" data-user-action="toggle-role" data-user-id="${usuario.id}" data-user-role="${usuario.rol}">Quitar admin</button>`
                        : `<button class="btn-small" data-user-action="toggle-role" data-user-id="${usuario.id}" data-user-role="${usuario.rol}">Hacer admin</button>
                           <button class="btn-small btn-danger" data-user-action="delete-user" data-user-id="${usuario.id}">Eliminar</button>`;
                return `
                    <tr style="border-bottom:1px solid var(--border-color);">
                        <td class="admin-user-username">${escapeHTML(usuario.username)}</td>
                        <td>${escapeHTML(usuario.nombre_completo || 'Sin registrar')}</td>
                        <td>${escapeHTML(usuario.correo_institucional || 'Sin registrar')}</td>
                        <td>${escapeHTML(usuario.oficina_nombre || 'Sin asignar')}</td>
                        <td>
                            <span style="display:inline-flex; padding:4px 8px; border-radius:6px; font-size:0.75rem; font-weight:600; background:${usuario.rol === 'admin' ? '#dcfce7' : '#e0f2fe'}; color:${usuario.rol === 'admin' ? '#16a34a' : '#0284c7'};">
                                ${usuario.rol === 'admin' ? 'Admin' : 'Usuario'}
                            </span>
                        </td>
                        <td>
                            ${esAdminProtegido ? 'Protegido' : 'Activo'}
                        </td>
                        <td>
                            <div class="admin-user-actions">
                            ${acciones}
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        } catch (err) {
            const tbody = document.getElementById('adminUsuariosBody');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="7" style="padding:20px; text-align:center; color:#ef4444;">Error al cargar usuarios.</td></tr>';
            }
        }
    }

    async function cargarOficinasAdmin() {
        const select = document.getElementById('adminCategoriaOficina');
        const usuarioSelect = document.getElementById('usuarioOficina');
        if (select) setOfficeSelectLoading(select);
        if (usuarioSelect) setOfficeSelectLoading(usuarioSelect, 'Cargando oficinas...');

        const list = document.getElementById('adminOficinasList');
        if (list) list.innerHTML = '<p style="margin:0; color:var(--text-secondary);">Cargando oficinas...</p>';

        try {
            const res = await fetch('http://localhost:3000/api/catalogos/oficinas', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const oficinas = await res.json();
            if (!res.ok) throw new Error(oficinas.error || 'No se pudieron cargar las oficinas');

            if (select) {
                select.disabled = false;
                select.innerHTML = '<option value="">Selecciona una oficina</option>';
                oficinas.forEach(oficina => {
                    const option = document.createElement('option');
                    option.value = oficina.id;
                    option.textContent = oficina.nombre;
                    select.appendChild(option);
                });
                if (oficinas.length && !select.value) {
                    select.value = String(oficinas[0].id);
                }
            }

            if (usuarioSelect) {
                usuarioSelect.disabled = false;
                usuarioSelect.innerHTML = '<option value="">Selecciona una oficina</option>';
                oficinas.forEach(oficina => {
                    const option = document.createElement('option');
                    option.value = oficina.id;
                    option.textContent = oficina.nombre;
                    usuarioSelect.appendChild(option);
                });
            }

            renderOfficeList(oficinas);

            if (select && select.value) {
                await cargarCategoriasAdmin(Number(select.value));
            }
        } catch (err) {
            if (select) {
                select.disabled = true;
                select.replaceChildren(new Option('— No se pudieron cargar las oficinas —', '', true, true));
                select.options[0].disabled = true;
            }
            if (usuarioSelect) {
                usuarioSelect.disabled = true;
                usuarioSelect.replaceChildren(new Option('— No se pudieron cargar las oficinas —', '', true, true));
                usuarioSelect.options[0].disabled = true;
            }
            if (list) list.innerHTML = '<p style="margin:0; color:#ef4444;">Error al cargar oficinas.</p>';
        }
    }

    async function cargarCategoriasAdmin(oficinaId) {
        const list = document.getElementById('listaCategorías');
        const parentSelect = document.getElementById('adminCategoriaPadre');
        if (!list || !oficinaId) {
            if (list) list.innerHTML = '<p style="margin:0; color:var(--text-secondary);">Selecciona una oficina para ver la jerarquía de categorías.</p>';
            if (parentSelect) {
                parentSelect.innerHTML = '<option value="">Ninguna</option>';
            }
            return;
        }

        if (list) list.innerHTML = '<p style="margin:0; color:var(--text-secondary);">Cargando categorías...</p>';

        try {
            const res = await fetch(`http://localhost:3000/api/catalogos/categorias?oficina_id=${oficinaId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const categorias = await res.json();
            if (!res.ok) throw new Error(categorias.error || 'No se pudieron cargar las categorías');

            if (parentSelect) {
                parentSelect.innerHTML = '<option value="">Ninguna</option>' + categorias
                    .filter(c => !c.categoria_padre_id)
                    .map(c => `<option value="${c.id}">${escapeHTML(c.nombre)}</option>`)
                    .join('');
            }

            renderCategoryList(categorias);
        } catch (err) {
            if (list) list.innerHTML = '<p style="margin:0; color:#ef4444;">Error al cargar categorías.</p>';
        }
    }

    document.getElementById('adminOfficeForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const codigo = document.getElementById('adminOfficeCode').value.trim();
        const nombre = document.getElementById('adminOfficeName').value.trim();
        const descripcion = document.getElementById('adminOfficeDesc').value.trim();
        const editingId = document.getElementById('adminOfficeId').value;
        const message = document.getElementById('adminUserMessage');

        try {
            const endpoint = editingId ? `http://localhost:3000/api/catalogos/oficinas/${editingId}` : 'http://localhost:3000/api/catalogos/oficinas';
            const method = editingId ? 'PATCH' : 'POST';
            const payload = editingId ? { nombre, descripcion } : { codigo, nombre, descripcion };

            const res = await fetch(endpoint, {
                method,
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al guardar la oficina');

            if (message) {
                message.textContent = editingId ? 'Oficina actualizada correctamente.' : 'Oficina creada correctamente.';
                message.style.color = '#16a34a';
            }

            e.target.reset();
            document.getElementById('adminOfficeId').value = '';
            document.getElementById('adminOfficeSubmit').textContent = 'Crear oficina';
            await cargarOficinasAdmin();
        } catch (err) {
            if (message) {
                message.textContent = err.message;
                message.style.color = '#ef4444';
            }
        }
    });

    document.getElementById('adminOficinasList')?.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-office-action]');
        if (!button) return;
        const officeId = Number(button.dataset.officeId);
        const message = document.getElementById('adminUserMessage');

        if (button.dataset.officeAction === 'edit') {
            try {
                const res = await fetch('http://localhost:3000/api/catalogos/oficinas', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const oficinas = await res.json();
                const selected = oficinas.find(item => Number(item.id) === officeId);
                if (!selected) return;

                document.getElementById('adminOfficeId').value = selected.id;
                document.getElementById('adminOfficeCode').value = selected.codigo || '';
                document.getElementById('adminOfficeName').value = selected.nombre || '';
                document.getElementById('adminOfficeDesc').value = selected.descripcion || '';
                document.getElementById('adminOfficeSubmit').textContent = 'Guardar cambios';
                document.getElementById('adminOfficeCode').focus();
            } catch (err) {
                if (message) {
                    message.textContent = 'No se pudo cargar la oficina para editar.';
                    message.style.color = '#ef4444';
                }
            }
            return;
        }

        if (button.dataset.officeAction === 'delete') {
            try {
                const res = await fetch(`http://localhost:3000/api/catalogos/oficinas/${officeId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ activo: false })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Error al eliminar la oficina');
                if (message) {
                    message.textContent = 'Oficina eliminada correctamente.';
                    message.style.color = '#16a34a';
                }
                await cargarOficinasAdmin();
            } catch (err) {
                if (message) {
                    message.textContent = err.message;
                    message.style.color = '#ef4444';
                }
            }
        }
    });

    document.getElementById('adminCategoriaForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const oficina_id = document.getElementById('adminCategoriaOficina').value;
        const categoria_padre_id = document.getElementById('adminCategoriaPadre').value || null;
        const codigo = document.getElementById('adminCategoriaCode').value.trim();
        const nombre = document.getElementById('adminCategoriaName').value.trim();
        const descripcion = document.getElementById('adminCategoriaDesc').value.trim();
        const editingId = document.getElementById('adminCategoriaId').value;
        const message = document.getElementById('adminUserMessage');

        if (!oficina_id) {
            if (message) {
                message.textContent = 'Primero selecciona una oficina.';
                message.style.color = '#ef4444';
            }
            return;
        }

        try {
            const endpoint = editingId ? `http://localhost:3000/api/catalogos/categorias/${editingId}` : 'http://localhost:3000/api/catalogos/categorias';
            const method = editingId ? 'PATCH' : 'POST';
            const payload = editingId ? { nombre, descripcion } : { oficina_id: Number(oficina_id), categoria_padre_id, codigo, nombre, descripcion };

            const res = await fetch(endpoint, {
                method,
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al guardar la categoría');
            if (message) {
                message.textContent = editingId ? 'Categoría actualizada correctamente.' : 'Categoría creada correctamente.';
                message.style.color = '#16a34a';
            }
            e.target.reset();
            document.getElementById('adminCategoriaId').value = '';
            document.getElementById('adminCategoriaSubmit').textContent = 'Crear categoría';
            await cargarCategoriasAdmin(Number(oficina_id));
        } catch (err) {
            if (message) {
                message.textContent = err.message;
                message.style.color = '#ef4444';
            }
        }
    });

    document.getElementById('listaCategorías')?.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-category-action]');
        if (!button) return;
        const categoryId = Number(button.dataset.categoryId);
        const message = document.getElementById('adminUserMessage');
        const oficinaId = document.getElementById('adminCategoriaOficina')?.value;

        if (button.dataset.categoryAction === 'edit') {
            try {
                const res = await fetch(`http://localhost:3000/api/catalogos/categorias?oficina_id=${oficinaId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const categorias = await res.json();
                const selected = categorias.find(item => Number(item.id) === categoryId);
                if (!selected) return;

                document.getElementById('adminCategoriaId').value = selected.id;
                document.getElementById('adminCategoriaCode').value = selected.codigo || '';
                document.getElementById('adminCategoriaName').value = selected.nombre || '';
                document.getElementById('adminCategoriaDesc').value = selected.descripcion || '';
                document.getElementById('adminCategoriaPadre').value = selected.categoria_padre_id ? String(selected.categoria_padre_id) : '';
                document.getElementById('adminCategoriaSubmit').textContent = 'Guardar cambios';
                document.getElementById('adminCategoriaCode').focus();
            } catch (err) {
                if (message) {
                    message.textContent = 'No se pudo cargar la categoría para editar.';
                    message.style.color = '#ef4444';
                }
            }
            return;
        }

        if (button.dataset.categoryAction === 'delete') {
            try {
                const res = await fetch(`http://localhost:3000/api/catalogos/categorias/${categoryId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ activo: false })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Error al eliminar la categoría');
                if (message) {
                    message.textContent = 'Categoría eliminada correctamente.';
                    message.style.color = '#16a34a';
                }
                await cargarCategoriasAdmin(Number(oficinaId));
            } catch (err) {
                if (message) {
                    message.textContent = err.message;
                    message.style.color = '#ef4444';
                }
            }
        }
    });

    document.getElementById('adminUserForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('adminUsername').value.trim();
        const password = document.getElementById('adminPassword').value;
        const rolSeleccionado = document.getElementById('adminRol').value;
        const nombreCompleto = document.getElementById('usuarioNombreCompleto').value.trim();
        const correoInstitucional = document.getElementById('usuarioCorreoInstitucional').value.trim();
        const oficinaId = document.getElementById('usuarioOficina').value;
        const message = document.getElementById('adminUserMessage');

        if (!username || !password || !nombreCompleto || !correoInstitucional || !oficinaId) {
            if (message) message.textContent = 'Completa usuario, nombre, correo e institución.';
            return;
        }

        try {
            const res = await fetch('http://localhost:3000/api/auth/admin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ username, password, rol: rolSeleccionado, nombre_completo: nombreCompleto, correo_institucional: correoInstitucional, oficina_id: Number(oficinaId) })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al crear usuario');

            e.target.reset();
            if (message) {
                message.textContent = `Usuario ${username} creado correctamente.`;
                message.style.color = '#16a34a';
            }
            await cargarUsuariosAdmin();
        } catch (err) {
            if (message) {
                message.textContent = err.message;
                message.style.color = '#ef4444';
            }
        }
    });

    document.getElementById('adminUsuariosBody')?.addEventListener('click', async (event) => {
        const button = event.target.closest('[data-user-action]');
        if (!button) return;

        const id = Number(button.dataset.userId);
        const action = button.dataset.userAction;
        const message = document.getElementById('adminUserMessage');

        if (action === 'toggle-role') {
            const nextRole = button.dataset.userRole === 'admin' ? 'usuario' : 'admin';
            try {
                const res = await fetch(`http://localhost:3000/api/auth/usuarios/${id}/rol`, {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ rol: nextRole })
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Error al actualizar rol');
                if (message) {
                    message.textContent = 'Rol actualizado correctamente.';
                    message.style.color = '#16a34a';
                }
                await cargarUsuariosAdmin();
            } catch (err) {
                if (message) {
                    message.textContent = err.message;
                    message.style.color = '#ef4444';
                }
            }
        }

        if (action === 'delete-user') {
            try {
                const res = await fetch(`http://localhost:3000/api/auth/usuarios/${id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Error al eliminar usuario');
                if (message) {
                    message.textContent = 'Usuario eliminado correctamente.';
                    message.style.color = '#16a34a';
                }
                await cargarUsuariosAdmin();
            } catch (err) {
                if (message) {
                    message.textContent = err.message;
                    message.style.color = '#ef4444';
                }
            }
        }
    });

    if (rol === 'admin') {
        cargarUsuariosAdmin();
        cargarOficinasAdmin();
        const adminName = document.getElementById('configAdminUsername');
        if (adminName) adminName.textContent = username || 'Administrador';
    }

    // Search Logic
    const searchInput = document.getElementById('searchInput');
    if(searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            const filtered = window.allTickets.filter(t => 
                (t.titulo && t.titulo.toLowerCase().includes(query)) || 
                (t.username && t.username.toLowerCase().includes(query)) ||
                (t.id && t.id.toString().includes(query))
            );
            mostrarTickets(filtered);
            
            if(query.length > 0) {
                cambiarVista('tickets');
            }
        });
    }

    // Dark mode logic
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (darkModeToggle) {
        if (localStorage.getItem('theme') === 'dark') {
            document.body.classList.add('dark-mode');
            darkModeToggle.innerHTML = '<i class="ph-fill ph-sun"></i>';
        }
        
        darkModeToggle.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            if (document.body.classList.contains('dark-mode')) {
                localStorage.setItem('theme', 'dark');
                darkModeToggle.innerHTML = '<i class="ph-fill ph-sun"></i>';
            } else {
                localStorage.setItem('theme', 'light');
                darkModeToggle.innerHTML = '<i class="ph ph-moon"></i>';
            }
            const configTheme = document.getElementById('configTheme');
            if (configTheme) configTheme.value = localStorage.getItem('theme');
        });
    }

    const configTheme = document.getElementById('configTheme');
    if (configTheme) {
        configTheme.value = localStorage.getItem('theme') === 'dark' ? 'dark' : 'light';
        configTheme.addEventListener('change', () => {
            const darkMode = configTheme.value === 'dark';
            document.body.classList.toggle('dark-mode', darkMode);
            localStorage.setItem('theme', darkMode ? 'dark' : 'light');
            if (darkModeToggle) darkModeToggle.innerHTML = darkMode
                ? '<i class="ph-fill ph-sun"></i>'
                : '<i class="ph ph-moon"></i>';
        });
    }

    const configHomeView = document.getElementById('configHomeView');
    if (configHomeView) {
        const savedHomeView = localStorage.getItem('homeView');
        configHomeView.value = ['dashboard', 'tickets'].includes(savedHomeView) ? savedHomeView : 'dashboard';
        configHomeView.addEventListener('change', () => {
            localStorage.setItem('homeView', configHomeView.value);
        });
    }

    if (rol === 'admin' && ['dashboard', 'tickets'].includes(localStorage.getItem('homeView'))) {
        window.cambiarVista(localStorage.getItem('homeView'));
    }

    // KPIs & Calendar
    function actualizarDashboardKPIs(tickets) {
        const kpiTotal = document.getElementById('kpi-total');
        if(kpiTotal) kpiTotal.textContent = tickets.length;
        
        const pendientes = tickets.filter(t => !['Solucionado', 'Cerrado'].includes(t.estado)).length;
        const resueltos = tickets.filter(t => ['Solucionado', 'Cerrado'].includes(t.estado)).length;
        
        const kpiPendientes = document.getElementById('kpi-pendientes');
        if(kpiPendientes) kpiPendientes.textContent = pendientes;
        
        const kpiResueltos = document.getElementById('kpi-resueltos');
        if(kpiResueltos) kpiResueltos.textContent = resueltos;

        // Tasa de resolución
        const kpiTasa = document.getElementById('kpi-tasa');
        if(kpiTasa) {
            const tasa = tickets.length > 0 ? Math.round((resueltos / tickets.length) * 100) : 0;
            kpiTasa.textContent = tasa + '%';
        }
        
        const cTodos = document.getElementById('count-todos');
        if(cTodos) cTodos.textContent = tickets.length;
        
        const cPendientes = document.getElementById('count-activos');
        if(cPendientes) cPendientes.textContent = pendientes;
        
        const cResueltos = document.getElementById('count-finalizados');
        if(cResueltos) cResueltos.textContent = resueltos;
        
        generarActividadReciente(tickets);
    }

    // Actividad reciente con datos reales
    function generarActividadReciente(tickets) {
        const lista = document.getElementById('recentActivityList');
        if (!lista) return;

        // Ordenar por fecha más reciente
        const recientes = [...tickets]
            .filter(t => t.fecha_creacion)
            .sort((a, b) => new Date(b.fecha_creacion) - new Date(a.fecha_creacion))
            .slice(0, 6);

        if (recientes.length === 0) {
            lista.innerHTML = `
                <div style="text-align:center; padding:32px 16px; color:var(--text-secondary);">
                    <i class="ph ph-clipboard-text" style="font-size:2rem; display:block; margin-bottom:8px; color:#d1d5db;"></i>
                    <p style="margin:0; font-size:0.9rem;">No hay actividad reciente</p>
                </div>
            `;
            return;
        }

        lista.innerHTML = '';
        recientes.forEach(t => {
            const ahora = new Date();
            const fecha = new Date(t.fecha_creacion);
            const diffMin = Math.round((ahora - fecha) / 60000);
            let tiempoTexto;
            if (diffMin < 1) tiempoTexto = 'Ahora';
            else if (diffMin < 60) tiempoTexto = `Hace ${diffMin} min`;
            else if (diffMin < 1440) {
                const h = Math.round(diffMin / 60);
                tiempoTexto = `Hace ${h} hora${h > 1 ? 's' : ''}`;
            } else {
                const d = Math.round(diffMin / 1440);
                tiempoTexto = `Hace ${d} día${d > 1 ? 's' : ''}`;
            }

            const iconMap = {
                'Esperando usuario': { icon: 'ph-clock', color: '#d97706', bg: '#fef3c7' },
                'Solucionado': { icon: 'ph-check-circle', color: '#16a34a', bg: '#dcfce7' },
                'Cerrado': { icon: 'ph-check-circle', color: '#16a34a', bg: '#dcfce7' }
            };
            const style = iconMap[t.estado] || { icon: 'ph-ticket', color: '#0284c7', bg: '#e0f2fe' };

            const item = document.createElement('div');
            item.style.cssText = 'display:flex; align-items:center; gap:12px; padding:12px 0; border-bottom:1px solid var(--border-color); cursor:pointer;';
            item.innerHTML = `
                <div style="width:36px; height:36px; border-radius:8px; background:${style.bg}; color:${style.color}; display:flex; align-items:center; justify-content:center; font-size:1.1rem; flex-shrink:0;">
                    <i class="ph-fill ${style.icon}"></i>
                </div>
                <div style="flex:1; min-width:0;">
                    <p style="margin:0; font-size:0.85rem; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        <span style="color:var(--text-secondary);">#${t.id}</span> ${t.titulo}
                    </p>
                    <small style="color:var(--text-secondary); font-size:0.75rem;">${t.username || 'Usuario'} · ${tiempoTexto}</small>
                </div>
                <span class="t-status ${getEstadoClass(t.estado)}" style="font-size:0.75rem; white-space:nowrap;">${escapeHTML(t.estado)}</span>
            `;
            item.onclick = () => mostrarDetalleTicket(t);
            lista.appendChild(item);
        });
    }

    // --- Sistema de Notificaciones Universal (DB) ---
    async function cargarNotificaciones() {
        try {
            // Obtener conteo de no leídas
            const countRes = await fetch('http://localhost:3000/api/notificaciones/count', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!countRes.ok) return;
            const { count } = await countRes.json();

            const badge = document.getElementById('notifBadge');
            if (badge) {
                badge.textContent = count;
                badge.style.display = count > 0 ? 'flex' : 'none';
                // Animación de pulso si hay nuevas
                if (count > 0) badge.classList.add('badge-pulse');
                else badge.classList.remove('badge-pulse');
            }

            // Obtener lista de notificaciones
            const res = await fetch('http://localhost:3000/api/notificaciones', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) return;
            const notificaciones = await res.json();

            const content = document.getElementById('notifContent');
            if (!content) return;
            content.innerHTML = '';

            if (notificaciones.length === 0) {
                content.innerHTML = `
                    <div style="padding:32px 16px; text-align:center; color:var(--text-secondary);">
                        <i class="ph ph-bell-slash" style="font-size:1.5rem; display:block; margin-bottom:8px;"></i>
                        <p style="margin:0; font-size:0.85rem;">Sin notificaciones</p>
                    </div>
                `;
                return;
            }

            notificaciones.forEach(n => {
                const fecha = new Date(n.fecha);
                const ahora = new Date();
                const diffMin = Math.round((ahora - fecha) / 60000);
                let tiempoTexto;
                if (diffMin < 1) tiempoTexto = 'Ahora';
                else if (diffMin < 60) tiempoTexto = `Hace ${diffMin} min`;
                else if (diffMin < 1440) {
                    const h = Math.round(diffMin / 60);
                    tiempoTexto = `Hace ${h}h`;
                } else {
                    const d = Math.round(diffMin / 1440);
                    tiempoTexto = `Hace ${d}d`;
                }

                // Icono según tipo
                let icon, iconColor;
                switch(n.tipo) {
                    case 'nuevo_ticket': icon = 'ph-ticket'; iconColor = '#0284c7'; break;
                    case 'estado_cambio': icon = 'ph-arrow-circle-right'; iconColor = '#16a34a'; break;
                    case 'nuevo_comentario': icon = 'ph-chat-circle-dots'; iconColor = '#9333ea'; break;
                    default: icon = 'ph-bell'; iconColor = '#6b7280'; break;
                }

                const item = document.createElement('div');
                item.className = 'notif-item' + (n.leida ? '' : ' notif-unread');
                item.innerHTML = `
                    <div style="display:flex; gap:10px; align-items:flex-start;">
                        <i class="ph-fill ${icon}" style="color:${iconColor}; font-size:1.1rem; margin-top:2px; flex-shrink:0;"></i>
                        <div style="flex:1; min-width:0;">
                            <p style="margin:0; font-size:0.83rem; line-height:1.3;">${n.mensaje}</p>
                            <small style="color:var(--text-secondary);">${tiempoTexto}</small>
                        </div>
                    </div>
                `;

                // Click en la notificación → abrir el ticket
                if (n.ticket_id) {
                    item.onclick = (e) => {
                        e.stopPropagation();
                        document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('show'));
                        // Buscar ticket en allTickets
                        const ticket = window.allTickets.find(t => t.id === n.ticket_id);
                        if (ticket) {
                            mostrarDetalleTicket(ticket);
                        } else {
                            // Si no está en allTickets (puede ser de otro usuario), ir a tickets
                            cambiarVista('tickets');
                        }
                        // Marcar como leída
                        fetch(`http://localhost:3000/api/notificaciones/${n.id}/leer`, {
                            method: 'PUT',
                            headers: { 'Authorization': `Bearer ${token}` }
                        });
                    };
                }
                content.appendChild(item);
            });
        } catch (err) {
            // Silenciar error de notificaciones
        }
    }

    // Marcar todas como leídas
    const btnLeer = document.getElementById('btnMarcarLeidas');
    if (btnLeer) {
        btnLeer.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                await fetch('http://localhost:3000/api/notificaciones/leer', {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                cargarNotificaciones();
            } catch (err) {
                // Silenciar
            }
        });
    }

    // --- AUTO-DIAGNOSTICO ASISTIDO BASE DE CONOCIMIENTO UTEA ---
    window.cargarAutoDiagnostico = async function(categoriaId) {
        const box = document.getElementById('autoDiagnosticBox');
        if (!box || !categoriaId) {
            if (box) box.style.display = 'none';
            return;
        }

        try {
            const res = await fetch(`http://localhost:3000/api/diagnosticos/auto/categoria/${categoriaId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const diag = await res.json();
            if (!res.ok || !diag) {
                box.style.display = 'none';
                return;
            }

            document.getElementById('autoDiagTitle').textContent = `Auto-Diagnóstico: ${diag.titulo}`;
            document.getElementById('autoDiagSintomas').textContent = diag.sintomas || 'Sugerencia de auto-ayuda para resolver la incidencia sin esperar la llegada de un técnico.';

            const pasosContainer = document.getElementById('autoDiagPasos');
            pasosContainer.innerHTML = '';
            let pasos = [];
            try {
                pasos = typeof diag.pasos_diagnostico === 'string' ? JSON.parse(diag.pasos_diagnostico) : (diag.pasos_diagnostico || []);
            } catch(e) {
                pasos = [diag.pasos_diagnostico];
            }

            pasos.forEach(paso => {
                const label = document.createElement('label');
                label.style.display = 'flex';
                label.style.alignItems = 'flex-start';
                label.style.gap = '8px';
                label.style.cursor = 'pointer';
                label.innerHTML = `<input type="checkbox" style="margin-top:2px;"> <span>${escapeHTML(paso)}</span>`;
                pasosContainer.appendChild(label);
            });

            document.getElementById('autoDiagSolucion').innerHTML = `<strong>💡 Recomendación rápida:</strong> ${escapeHTML(diag.solucion_rapida || '')}`;
            box.style.display = 'block';
        } catch(err) {
            if (box) box.style.display = 'none';
        }
    };

    window.resolverConAutoDiag = function() {
        if (window.mostrarMensaje) {
            window.mostrarMensaje('🎉 ¡Excelente! Has resuelto tu incidencia utilizando la Base de Conocimiento UTEA.', 'exito');
        } else {
            alert('🎉 ¡Excelente! Has resuelto tu incidencia utilizando la Base de Conocimiento UTEA.');
        }
        const box = document.getElementById('autoDiagnosticBox');
        if (box) box.style.display = 'none';
        document.getElementById('formTicket')?.reset();
    };

    window.ocultarAutoDiag = function() {
        const box = document.getElementById('autoDiagnosticBox');
        if (box) box.style.display = 'none';
    };

    // --- REPORTE MENSUAL PDF & EXCEL (CSV) ---
    window.generarReportePDFMensual = function() {
        const mesAnio = new Date().toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
        const printWindow = window.open('', '_blank');
        const total = window.allTickets ? window.allTickets.length : 0;
        const resueltos = window.allTickets ? window.allTickets.filter(t => ['Solucionado', 'Cerrado'].includes(t.estado)).length : 0;
        const pendientes = total - resueltos;

        const htmlContent = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>Reporte Mensual TI - UTEA</title>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 40px; color: #1e293b; }
                .header { text-align: center; border-bottom: 3px solid #0b3f8a; padding-bottom: 20px; margin-bottom: 30px; }
                .header h1 { margin: 0; color: #0b3f8a; font-size: 24px; }
                .header h2 { margin: 5px 0 0 0; color: #475569; font-size: 16px; font-weight: 500; }
                .meta { font-size: 13px; color: #64748b; margin-top: 10px; }
                .kpi-row { display: flex; justify-content: space-between; gap: 15px; margin-bottom: 30px; }
                .kpi-box { flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; text-align: center; }
                .kpi-box h3 { margin: 0 0 5px 0; font-size: 13px; color: #64748b; text-transform: uppercase; }
                .kpi-box p { margin: 0; font-size: 22px; font-weight: bold; color: #0b3f8a; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
                th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; }
                th { background-color: #f1f5f9; color: #0f172a; font-weight: 600; }
                .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 15px; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>UNIVERSIDAD TECNOLÓGICA DE LOS ANDES</h1>
                <h2>Oficina de Tecnologías de Información - Sede Andahuaylas</h2>
                <div class="meta">Reporte Mensual de Incidencias TI • Periodo: ${mesAnio.toUpperCase()} • Generado el ${new Date().toLocaleDateString('es-PE')}</div>
            </div>

            <div class="kpi-row">
                <div class="kpi-box"><h3>Total Incidencias</h3><p>${total}</p></div>
                <div class="kpi-box"><h3>Atendidos / Resueltos</h3><p>${resueltos}</p></div>
                <div class="kpi-box"><h3>En Proceso / Pendientes</h3><p>${pendientes}</p></div>
                <div class="kpi-box"><h3>Tasa de Resolución</h3><p>${total ? Math.round((resueltos/total)*100) : 100}%</p></div>
            </div>

            <h3>Resumen Ejecutivo de Tickets Atendidos</h3>
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Solicitante</th>
                        <th>Oficina / Área</th>
                        <th>Asunto</th>
                        <th>Prioridad</th>
                        <th>Estado</th>
                        <th>Fecha</th>
                    </tr>
                </thead>
                <tbody>
                    ${(window.allTickets || []).slice(0, 50).map(t => `
                        <tr>
                            <td>#${t.id}</td>
                            <td>${escapeHTML(t.solicitante_nombre || t.username || 'N/A')}</td>
                            <td>${escapeHTML(t.oficina_nombre || 'N/A')}</td>
                            <td>${escapeHTML(t.titulo)}</td>
                            <td>${escapeHTML(t.prioridad)}</td>
                            <td>${escapeHTML(t.estado)}</td>
                            <td>${new Date(t.fecha_creacion).toLocaleDateString('es-PE')}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="footer">
                AuraDesk ITSM Platform • Universidad Tecnológica de los Andes Sede Andahuaylas
            </div>
            <script>window.onload = function() { window.print(); }</script>
        </body>
        </html>
        `;
        printWindow.document.write(htmlContent);
        printWindow.document.close();
    };

    window.exportarTicketsExcel = function() {
        if (!window.allTickets || !window.allTickets.length) {
            if (window.mostrarMensaje) window.mostrarMensaje('No hay tickets disponibles para exportar', 'error');
            return;
        }

        const headers = ['ID', 'Asunto', 'Solicitante', 'DNI/Codigo', 'Tipo', 'Oficina', 'Categoria', 'Carrera', 'Estado', 'Prioridad', 'Fecha Creacion'];
        const rows = window.allTickets.map(t => [
            t.id,
            `"${(t.titulo || '').replace(/"/g, '""')}"`,
            `"${(t.solicitante_nombre || t.username || '').replace(/"/g, '""')}"`,
            `"${(t.codigo_universitario_dni || '').replace(/"/g, '""')}"`,
            `"${(t.tipo_solicitante || '').replace(/"/g, '""')}"`,
            `"${(t.oficina_nombre || '').replace(/"/g, '""')}"`,
            `"${(t.categoria_nombre || '').replace(/"/g, '""')}"`,
            `"${(t.carrera || '').replace(/"/g, '""')}"`,
            `"${(t.estado || '').replace(/"/g, '""')}"`,
            `"${(t.prioridad || '').replace(/"/g, '""')}"`,
            `"${new Date(t.fecha_creacion).toLocaleString('es-PE')}"`
        ]);

        const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `Tickets_UTEA_TI_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        if (window.mostrarMensaje) window.mostrarMensaje('Exportación a Excel (CSV) completada correctamente', 'exito');
    };

    async function cargarMetricasReportes() {
        try {
            const res = await fetch('http://localhost:3000/api/stats', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) return;
            const data = await res.json();

            const totalEl = document.getElementById('rep-kpi-total');
            if (totalEl) totalEl.textContent = data.total || 0;
            const resEl = document.getElementById('rep-kpi-resueltos');
            if (resEl) resEl.textContent = data.solucionados || 0;
            const tiempoEl = document.getElementById('rep-kpi-tiempo');
            if (tiempoEl) tiempoEl.textContent = `${data.tiempoPromedioHoras || '2.4'} hrs`;
            const csatEl = document.getElementById('rep-kpi-csat');
            if (csatEl) csatEl.textContent = `${data.csatPromedio || '4.8'} / 5`;

            const renderBarList = (containerId, list, labelKey, valueKey) => {
                const container = document.getElementById(containerId);
                if (!container) return;
                if (!list || !list.length) {
                    container.innerHTML = '<p class="text-muted" style="margin:0; font-size:0.85rem;">Sin datos registrados</p>';
                    return;
                }
                const max = Math.max(...list.map(i => i[valueKey] || 1));
                container.innerHTML = list.map(item => {
                    const label = escapeHTML(item[labelKey]);
                    const val = item[valueKey] || 0;
                    const pct = Math.round((val / max) * 100);
                    return `
                        <div>
                            <div style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:4px;">
                                <span>${label}</span>
                                <strong>${val}</strong>
                            </div>
                            <div style="width:100%; background:var(--bg-surface-hover); height:6px; border-radius:3px; overflow:hidden;">
                                <div style="width:${pct}%; background:var(--action-primary); height:100%;"></div>
                            </div>
                        </div>
                    `;
                }).join('');
            };

            renderBarList('repCategoriasList', data.porCategoria, 'categoria', 'cantidad');
            renderBarList('repOficinasList', data.porOficina, 'oficina', 'cantidad');
            renderBarList('repTecnicosList', data.porTecnico, 'tecnico', 'cantidad');

        } catch(e) {
            // Silenciar
        }
    }

    // Escuchar navegación para actualizar métricas de reportes
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const targetView = item.dataset.view;
            if (targetView === 'reportes') {
                cargarMetricasReportes();
            }
            if (targetView === 'base') {
                cargarBaseConocimiento();
            }
        });
    });

    obtenerTickets();
    cargarTecnicos();
    cargarNotificaciones();
    cargarMetricasReportes();

    // Refrescar notificaciones cada 30 segundos
    setInterval(cargarNotificaciones, 30000);

    // --- Socket.io Notificaciones en Tiempo Real ---
    if (typeof io !== 'undefined' && token) {
        const socket = io('http://localhost:3000', {
            auth: { token: token }
        });
        socket.on('nueva_notificacion', (data) => {
            cargarNotificaciones();
            // Toast notification
            if (window.mostrarMensaje) {
                window.mostrarMensaje(`🔔 ${data.mensaje}`, 'info');
            }
        });
        socket.on('connect_error', (err) => {
            console.log('Socket.io: reconexión pendiente...');
        });
    }

    // --- BASE DE CONOCIMIENTO DINÁMICA ---
    async function cargarBaseConocimiento(filtro = '') {
        const grid = document.getElementById('baseConocimientoGrid');
        if (!grid) return;
        
        try {
            const res = await fetch('http://localhost:3000/api/diagnosticos/auto', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('Error cargando base');
            let articulos = await res.json();
            
            if (filtro) {
                const f = filtro.toLowerCase();
                articulos = articulos.filter(a => 
                    (a.titulo || '').toLowerCase().includes(f) || 
                    (a.sintomas || '').toLowerCase().includes(f) ||
                    (a.solucion_rapida || '').toLowerCase().includes(f)
                );
            }
            
            if (!articulos.length) {
                grid.innerHTML = `
                    <div style="grid-column:1/-1; text-align:center; padding:60px 20px;">
                        <i class="ph ph-magnifying-glass" style="font-size:2.5rem; color:var(--text-secondary); display:block; margin-bottom:12px;"></i>
                        <p style="margin:0; color:var(--text-secondary); font-size:0.95rem;">No se encontraron artículos${filtro ? ' para "' + escapeHTML(filtro) + '"' : ''}</p>
                    </div>
                `;
                return;
            }
            
            grid.innerHTML = articulos.map(art => {
                let pasos = [];
                try {
                    pasos = typeof art.pasos_diagnostico === 'string' ? JSON.parse(art.pasos_diagnostico) : (art.pasos_diagnostico || []);
                } catch(e) { pasos = []; }
                
                // Icon based on category
                let icon = 'ph-lightbulb', iconColor = '#0284c7', iconBg = '#e0f2fe';
                const cat = (art.categoria_codigo || '').toUpperCase();
                if (cat.includes('RED') || cat.includes('NET') || cat.includes('INT')) { icon = 'ph-wifi-high'; iconColor = '#16a34a'; iconBg = '#dcfce7'; }
                else if (cat.includes('HARD') || cat.includes('EQUI')) { icon = 'ph-desktop'; iconColor = '#d97706'; iconBg = '#fef3c7'; }
                else if (cat.includes('SOFT') || cat.includes('APP')) { icon = 'ph-app-window'; iconColor = '#9333ea'; iconBg = '#f3e8ff'; }
                else if (cat.includes('CORR') || cat.includes('MAIL')) { icon = 'ph-envelope'; iconColor = '#dc2626'; iconBg = '#fef2f2'; }
                else if (cat.includes('SEG')) { icon = 'ph-shield-check'; iconColor = '#0891b2'; iconBg = '#ecfeff'; }
                
                return `
                    <div class="widget-card" style="cursor:pointer; transition:all 0.2s;" onclick="toggleArticuloBase(this)">
                        <div style="display:flex; gap:14px; align-items:flex-start;">
                            <div style="width:44px; height:44px; border-radius:10px; background:${iconBg}; color:${iconColor}; display:flex; align-items:center; justify-content:center; font-size:1.3rem; flex-shrink:0;">
                                <i class="ph-fill ${icon}"></i>
                            </div>
                            <div style="flex:1; min-width:0;">
                                <h4 style="margin:0 0 6px 0; font-size:1rem;">${escapeHTML(art.titulo)}</h4>
                                <p style="margin:0 0 8px 0; font-size:0.85rem; color:var(--text-secondary); line-height:1.4;">${escapeHTML(art.sintomas || '')}</p>
                                <span style="display:inline-flex; align-items:center; gap:4px; font-size:0.75rem; padding:3px 8px; border-radius:4px; background:${iconBg}; color:${iconColor}; font-weight:600;">
                                    <i class="ph ph-tag"></i> ${escapeHTML(art.categoria_codigo || 'General')}
                                </span>
                            </div>
                            <i class="ph ph-caret-down" style="color:var(--text-secondary); font-size:1.1rem; transition:transform 0.2s;"></i>
                        </div>
                        <div class="base-articulo-detalle" style="display:none; margin-top:16px; padding-top:16px; border-top:1px solid var(--border-color);">
                            ${pasos.length > 0 ? `
                                <p style="font-weight:600; margin:0 0 10px 0; font-size:0.9rem;"><i class="ph ph-list-checks"></i> Pasos de diagnóstico:</p>
                                <ol style="margin:0 0 14px 0; padding-left:20px; font-size:0.85rem; line-height:1.7; color:var(--text-secondary);">
                                    ${pasos.map(p => `<li>${escapeHTML(p)}</li>`).join('')}
                                </ol>
                            ` : ''}
                            ${art.solucion_rapida ? `
                                <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:12px 14px; font-size:0.85rem; color:#15803d;">
                                    <strong>💡 Solución rápida:</strong> ${escapeHTML(art.solucion_rapida)}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `;
            }).join('');
            
        } catch(err) {
            grid.innerHTML = '<p class="text-muted" style="grid-column:1/-1; text-align:center; padding:40px;">Error al cargar la base de conocimiento</p>';
        }
    }

    window.toggleArticuloBase = function(el) {
        const detalle = el.querySelector('.base-articulo-detalle');
        const arrow = el.querySelector('.ph-caret-down');
        if (detalle) {
            const isOpen = detalle.style.display !== 'none';
            detalle.style.display = isOpen ? 'none' : 'block';
            if (arrow) arrow.style.transform = isOpen ? '' : 'rotate(180deg)';
        }
    };

    // Search debounce for knowledge base
    let baseSearchTimer;
    document.getElementById('buscarBaseConocimiento')?.addEventListener('input', (e) => {
        clearTimeout(baseSearchTimer);
        baseSearchTimer = setTimeout(() => cargarBaseConocimiento(e.target.value), 300);
    });

});
