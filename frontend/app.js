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

        return window.fetchAPI(url, { ...options, allowHttpErrors: true }).then(response => {
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
    const puedeGestionarCuentas = ['admin', 'superadmin', 'tecnico', 'adminti'].includes(userRoleNormalizado);
    const accountStatsSection = document.getElementById('accountStatsSection');
    if (accountStatsSection) accountStatsSection.hidden = !puedeGestionarCuentas;
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
        'Laboratorio de Ingeniería Civil': { oficina: 'LAB', categoria: 'LAB-COMPUTADORAS' },
        'Asistencia': { oficina: 'ADM', categoria: 'ADM-ASISTENCIA' }
    };
    let oficinasCatalogoPromise;
    const categoriasPorOficina = new Map();
    const getAuthHeaders = () => {
        const token = localStorage.getItem('token');
        return token ? { Authorization: `Bearer ${token}` } : {};
    };

    async function resolverCatalogoAmbiente(ambiente) {
        const mapeo = catalogoPorAmbiente[ambiente];
        if (!mapeo) throw new Error('No existe un mapeo de oficina para el ambiente seleccionado');

        if (!oficinasCatalogoPromise) {
            oficinasCatalogoPromise = fetch('/api/catalogos/oficinas', {
                headers: getAuthHeaders()
            }).then(async response => {
                const oficinas = await response.json();
                if (!response.ok) throw new Error(oficinas.error || 'No se pudieron cargar las oficinas');
                return oficinas;
            }).catch(error => {
                oficinasCatalogoPromise = null;
                throw error;
            });
        }
        const oficinas = await oficinasCatalogoPromise;
        const oficina = oficinas.find(item => item.codigo === mapeo.oficina);
        if (!oficina) throw new Error(`No se encontró la oficina ${mapeo.oficina} en el catálogo`);

        if (!categoriasPorOficina.has(oficina.id)) {
            const params = new URLSearchParams({ oficina_id: oficina.id });
            const categoriasPromise = fetch(`/api/catalogos/categorias?${params}`, {
                headers: getAuthHeaders()
            }).then(async response => {
                const categorias = await response.json();
                if (!response.ok) throw new Error(categorias.error || 'No se pudieron cargar las categorías');
                return categorias;
            }).catch(error => {
                categoriasPorOficina.delete(oficina.id);
                throw error;
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
            cargarMetricasReportes();
            renderSupportSummary();
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

    let accountIncidences = [];
    let accountPlatformsChart = null;
    let accountResolutionChart = null;

    function formatearFechaCuenta(value) {
        if (!value) return 'Fecha no disponible';
        const normalized = typeof value === 'string' ? value.replace(' ', 'T') : value;
        const date = new Date(normalized);
        return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('es-PE');
    }

    function renderAccountIncidents(container) {
        if (!container) return;
        container.replaceChildren();
        if (!accountIncidences.length) {
            const empty = document.createElement('p');
            empty.className = 'text-muted';
            empty.textContent = 'No hay incidencias de cuentas registradas.';
            container.appendChild(empty);
            return;
        }

        accountIncidences.slice(0, container.id === 'accountRecentIncidents' ? 5 : accountIncidences.length)
            .forEach(incidencia => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'account-incident-row';
                button.dataset.accountIncidentId = incidencia.id;

                const main = document.createElement('span');
                main.className = 'account-incident-main';
                const title = document.createElement('strong');
                title.textContent = `#${incidencia.id} · ${incidencia.plataforma || 'Cuenta institucional'}`;
                const description = document.createElement('small');
                description.textContent = `${incidencia.tipo_problema || 'Incidencia'} · ${incidencia.nombres || ''} ${incidencia.apellidos || ''}`.trim();
                const date = document.createElement('small');
                date.textContent = formatearFechaCuenta(incidencia.fecha_creacion);
                main.append(title, description, date);

                const status = document.createElement('span');
                status.className = 'account-status-badge';
                if (incidencia.estado === 'ESCALADO_ABANCAY') {
                    status.classList.add('is-escalated');
                    status.textContent = '↗ Escalado a Abancay';
                } else {
                    status.textContent = incidencia.estado || 'NUEVO';
                }
                button.append(main, status);
                container.appendChild(button);
            });
    }

    function renderAccountPlatformChart() {
        const canvas = document.getElementById('accountPlatformsChart');
        const message = document.getElementById('accountChartMessage');
        if (!canvas || !message) return;

        const currentMonth = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Lima',
            year: 'numeric',
            month: '2-digit'
        }).format(new Date());
        const counts = new Map();
        accountIncidences.forEach(incidencia => {
            const date = String(incidencia.fecha_creacion || '').slice(0, 7);
            if (date !== currentMonth) return;
            const platform = incidencia.plataforma || 'Sin plataforma';
            counts.set(platform, (counts.get(platform) || 0) + 1);
        });
        const entries = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

        if (accountPlatformsChart) {
            accountPlatformsChart.destroy();
            accountPlatformsChart = null;
        }
        if (!entries.length) {
            message.textContent = 'Aún no hay incidencias de cuentas este mes.';
            return;
        }
        if (typeof window.Chart !== 'function') {
            message.textContent = 'No se pudo cargar Chart.js para mostrar el gráfico.';
            return;
        }

        message.textContent = '';
        accountPlatformsChart = new window.Chart(canvas, {
            type: 'bar',
            data: {
                labels: entries.map(([name]) => name),
                datasets: [{
                    label: 'Incidencias este mes',
                    data: entries.map(([, count]) => count),
                    backgroundColor: ['#0b3f8a', '#7c3aed', '#f97316', '#0f766e', '#2563eb'],
                    borderRadius: 7,
                    maxBarThickness: 52
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: { legend: { display: false } },
                scales: {
                    x: { beginAtZero: true, ticks: { precision: 0 } },
                    y: { grid: { display: false } }
                }
            }
        });
    }

    function renderAccountResolutionChart(stats) {
        const canvas = document.getElementById('accountResolutionChart');
        const fallback = document.getElementById('accountChartFallback');
        const message = document.getElementById('accountResolutionChartMessage');
        if (!canvas || !fallback || !message) return;

        const locallyResolved = Number(stats.resueltos_localmente_pct) || 0;
        const escalated = Number(stats.escalados_abancay_pct) || 0;
        const other = Math.max(0, 100 - locallyResolved - escalated);
        const values = [
            ['Resueltos localmente (Andahuaylas)', locallyResolved],
            ['Escalados a Abancay', escalated],
            ['En atención / otros', other]
        ];

        if (accountResolutionChart) {
            accountResolutionChart.destroy();
            accountResolutionChart = null;
        }
        if (typeof window.Chart !== 'function') {
            canvas.hidden = true;
            fallback.hidden = false;
            fallback.replaceChildren();
            values.forEach(([label, value]) => {
                const row = document.createElement('div');
                row.className = 'account-chart-fallback-row';
                const name = document.createElement('span');
                name.textContent = label;
                const percentage = document.createElement('strong');
                percentage.textContent = `${Number(value.toFixed(2))}%`;
                row.append(name, percentage);
                fallback.appendChild(row);
            });
            message.textContent = 'Gráfico no disponible; se muestra el resumen en formato de lista.';
            return;
        }

        canvas.hidden = false;
        fallback.hidden = true;
        message.textContent = '';
        accountResolutionChart = new window.Chart(canvas, {
            type: 'doughnut',
            data: {
                labels: values.map(([label]) => label),
                datasets: [{
                    data: values.map(([, value]) => Number(value.toFixed(2))),
                    backgroundColor: ['#16a34a', '#9333ea', '#cbd5e1'],
                    borderColor: ['#15803d', '#7e22ce', '#94a3b8'],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '62%',
                plugins: {
                    legend: { position: 'bottom' },
                    tooltip: { callbacks: { label: context => `${context.label}: ${context.raw}%` } }
                }
            }
        });
    }

    async function cargarIncidenciasCuentas() {
        const list = document.getElementById('accountIncidentsList');
        const recent = document.getElementById('accountRecentIncidents');
        try {
            const data = await window.CuentasApi.getIncidencias();
            if (!Array.isArray(data)) throw new Error('La respuesta de incidencias de cuentas no es válida');
            accountIncidences = data;
            cargarMetricasReportes();
            renderSupportSummary();
            renderAccountIncidents(list);
            renderAccountIncidents(recent);
            if (puedeGestionarCuentas) renderAccountPlatformChart();
        } catch (error) {
            [list, recent].filter(Boolean).forEach(container => {
                container.textContent = error.message;
            });
            const chartMessage = document.getElementById('accountChartMessage');
            if (chartMessage) chartMessage.textContent = error.message;
        }
    }

    async function cargarEstadisticasCuentas() {
        try {
            const data = await window.CuentasApi.getStats();
            const total = document.getElementById('accountKpiTotal');
            const resolved = document.getElementById('accountKpiLocal');
            const escalated = document.getElementById('accountKpiEscalated');
            if (total) total.textContent = data.total ?? 0;
            if (resolved) resolved.textContent = `${Number(data.resueltos_localmente_pct || 0)}%`;
            if (escalated) escalated.textContent = `${Number(data.escalados_abancay_pct || 0)}%`;
            renderAccountResolutionChart(data);
            renderAccountPlatformChart();
        } catch (error) {
            const chartMessage = document.getElementById('accountChartMessage');
            if (chartMessage) chartMessage.textContent = error.message;
            const resolutionMessage = document.getElementById('accountResolutionChartMessage');
            if (resolutionMessage) resolutionMessage.textContent = error.message;
        }
    }

    async function crearIncidenciaCuenta(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
            const formData = new FormData(form);
            const data = await window.CuentasApi.crearTicketCuenta(formData);
            mostrarMensaje(data.mensaje || 'Solicitud de cuenta enviada correctamente', 'exito');
            form.reset();
            closeQuickTicket();
            await cargarIncidenciasCuentas();
        } catch (error) {
            mostrarMensaje(error.message, 'error');
        } finally {
            button.disabled = false;
        }
    }

    async function mostrarDetalleIncidenciaCuenta(id) {
        const incidenciaId = Number(id);
        if (!Number.isSafeInteger(incidenciaId) || incidenciaId < 1) return;
        const detalle = document.getElementById('ticketDetalle');
        const overlay = document.getElementById('overlay');
        if (!detalle || !overlay) return;

        detalle.innerHTML = '<div class="detalle-contenido"><p class="text-muted">Cargando incidencia...</p></div>';
        detalle.style.display = 'block';
        overlay.style.display = 'block';
        try {
            const data = await window.CuentasApi.getIncidencia(incidenciaId);
            const incidencia = data.incidencia;
            if (!incidencia) throw new Error('La respuesta no contiene la incidencia');

            const statusClass = incidencia.estado === 'ESCALADO_ABANCAY'
                ? 'account-status-badge is-escalated'
                : 'account-status-badge';
            const historyHTML = (data.historial || []).length
                ? data.historial.map(item => `
                    <article class="account-detail-entry">
                        <strong>${escapeHTML(item.accion || 'Actualización')}</strong>
                        <small style="display:block; color:var(--text-secondary); margin:4px 0;">
                            ${escapeHTML(item.estado_anterior || '—')} → ${escapeHTML(item.estado_nuevo || '—')}
                            · ${escapeHTML(formatearFechaCuenta(item.fecha))}
                        </small>
                        <span>${escapeHTML(item.comentario || '')}</span>
                    </article>
                `).join('')
                : '<p class="text-muted">Aún no hay cambios registrados.</p>';
            const evidenceHTML = (data.evidencias || []).length
                ? data.evidencias.map(item => `
                    <article class="account-detail-entry">
                        <strong>${escapeHTML(item.nombre_original)}</strong>
                        <small style="display:block; color:var(--text-secondary);">
                            ${escapeHTML(item.tipo)} · ${escapeHTML(item.tipo_mime)}
                            · ${(Number(item.tamano_bytes) / 1024 / 1024).toFixed(2)} MB
                            · ${escapeHTML(formatearFechaCuenta(item.fecha_creacion))}
                        </small>
                    </article>
                `).join('')
                : '<p class="text-muted">Todavía no hay evidencias adjuntas.</p>';
            const escalationHTML = puedeGestionarCuentas && incidencia.estado !== 'RESUELTO' &&
                incidencia.estado !== 'ESCALADO_ABANCAY'
                ? `<button type="button" class="btn-primary" data-open-escalation="${incidencia.id}"><i class="ph ph-arrow-fat-up"></i> Escalar a Abancay</button>`
                : '';
            const solutionHTML = puedeGestionarCuentas && incidencia.estado !== 'RESUELTO'
                ? `<form id="accountSolutionForm" class="account-action-form" data-account-id="${incidencia.id}">
                       <label for="accountSolution">Solución del técnico</label>
                       <textarea id="accountSolution" name="solucion" maxlength="10000" required></textarea>
                       <button type="submit" class="btn-primary">Registrar solución</button>
                   </form>`
                : incidencia.solucion
                    ? `<div class="account-detail-entry"><strong>Solución:</strong><br>${escapeHTML(incidencia.solucion)}</div>`
                    : '';
            const uploadHTML = puedeGestionarCuentas
                ? `<form id="accountEvidenceForm" class="account-action-form" data-account-id="${incidencia.id}">
                       <label for="accountEvidenceType">Tipo de evidencia</label>
                       <select id="accountEvidenceType" name="tipo" required>
                           <option value="SOPORTE_ANDAHUAYLAS">Soporte Andahuaylas</option>
                           <option value="SOPORTE_ABANCAY">Soporte Abancay</option>
                       </select>
                       <label for="accountEvidenceFile">Archivo</label>
                       <input id="accountEvidenceFile" name="archivo" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required>
                       <button type="submit" class="btn-secondary"><i class="ph ph-upload-simple"></i> Adjuntar evidencia</button>
                   </form>`
                : '';
            const escalamientosHTML = (data.escalamientos || []).length
                ? `<div class="account-detail-list">${data.escalamientos.map(item => `
                    <article class="account-detail-entry">
                        <strong>${escapeHTML(item.origen)} → ${escapeHTML(item.destino)}</strong>
                        <small style="display:block; color:var(--text-secondary);">${escapeHTML(item.estado)} · ${escapeHTML(formatearFechaCuenta(item.fecha_escalamiento))}</small>
                        <span>${escapeHTML(item.motivo || '')}</span>
                    </article>
                `).join('')}</div>`
                : '<p class="text-muted">Sin escalamientos.</p>';

            detalle.innerHTML = `
                <div class="detalle-contenido">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
                        <div>
                            <small style="color:var(--text-secondary);">Incidencia de cuenta #${incidencia.id}</small>
                            <h3 style="margin:4px 0 12px;">${escapeHTML(incidencia.plataforma || 'Cuenta institucional')} · ${escapeHTML(incidencia.tipo_problema)}</h3>
                        </div>
                        <button class="close-btn" onclick="cerrarDetalle()" aria-label="Cerrar"><i class="ph ph-x"></i></button>
                    </div>
                    <div class="account-detail-actions">
                        <span class="${statusClass}">${incidencia.estado === 'ESCALADO_ABANCAY' ? '↗ Escalado a Abancay' : escapeHTML(incidencia.estado)}</span>
                        <span class="account-status-badge">${escapeHTML(incidencia.prioridad)}</span>
                        ${escalationHTML}
                    </div>
                    <section class="account-detail-section">
                        <h4>Datos de la solicitud</h4>
                        <div class="account-detail-grid">
                            <div><strong>Solicitante</strong><br>${escapeHTML(`${incidencia.nombres || ''} ${incidencia.apellidos || ''}`.trim())}</div>
                            <div><strong>Tipo de usuario</strong><br>${escapeHTML(incidencia.tipo_usuario)}</div>
                            <div><strong>DNI / Código</strong><br>${escapeHTML(incidencia.dni_codigo)}</div>
                            <div><strong>Facultad</strong><br>${escapeHTML(incidencia.facultad || 'No especificada')}</div>
                            <div><strong>Correo alternativo</strong><br>${escapeHTML(incidencia.correo_alternativo || 'No especificado')}</div>
                            <div><strong>Oficina</strong><br>${escapeHTML(incidencia.oficina || 'No especificada')}</div>
                            <div><strong>Creada</strong><br>${escapeHTML(formatearFechaCuenta(incidencia.fecha_creacion))}</div>
                            ${incidencia.fecha_resolucion ? `<div><strong>Resuelta</strong><br>${escapeHTML(formatearFechaCuenta(incidencia.fecha_resolucion))}</div>` : ''}
                            ${data.ticket ? `<div><strong>Ticket tradicional asociado</strong><br>#${escapeHTML(data.ticket.id)} · ${escapeHTML(data.ticket.titulo || '')}</div>` : ''}
                        </div>
                        <p style="white-space:pre-wrap; line-height:1.55;">${escapeHTML(incidencia.descripcion)}</p>
                    </section>
                    ${solutionHTML ? `<section class="account-detail-section"><h4>Solución</h4>${solutionHTML}</section>` : ''}
                    <section class="account-detail-section">
                        <h4>Historial de Cambios</h4>
                        <div class="account-detail-list">${historyHTML}</div>
                    </section>
                    <section class="account-detail-section">
                        <h4>Escalamiento entre sedes</h4>
                        ${escalamientosHTML}
                    </section>
                    <section class="account-detail-section">
                        <h4>Evidencias</h4>
                        <div id="accountEvidenceList" class="account-detail-list">${evidenceHTML}</div>
                        ${uploadHTML}
                    </section>
                    <div class="account-detail-section"><button type="button" class="btn-small" onclick="cerrarDetalle()">Cerrar</button></div>
                </div>
            `;
        } catch (error) {
            detalle.innerHTML = `<div class="detalle-contenido"><button class="close-btn" onclick="cerrarDetalle()" aria-label="Cerrar"><i class="ph ph-x"></i></button><p role="alert">${escapeHTML(error.message)}</p></div>`;
        }
    }

    document.getElementById('accountIncidentsList')?.addEventListener('click', event => {
        const button = event.target.closest('[data-account-incident-id]');
        if (button) mostrarDetalleIncidenciaCuenta(button.dataset.accountIncidentId);
    });
    document.getElementById('accountRecentIncidents')?.addEventListener('click', event => {
        const button = event.target.closest('[data-account-incident-id]');
        if (button) mostrarDetalleIncidenciaCuenta(button.dataset.accountIncidentId);
    });
    document.getElementById('refreshAccountIncidents')?.addEventListener('click', cargarIncidenciasCuentas);

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
        if (escalationModal?.style.display === 'block') closeEscalation();
    };

    window.crearTicket = async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        mostrarLoading(true, btn);

        const titulo = document.getElementById('titulo').value;
        const descripcion = document.getElementById('descripcion').value;
        const categoria_usuario = document.getElementById('ticketCategoria').value;
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
                    categoria_usuario,
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
    document.getElementById('accountTicketForm')?.addEventListener('submit', crearIncidenciaCuenta);

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
    const escalationModal = document.getElementById('escalationModal');
    const escalationOverlay = document.getElementById('escalationOverlay');
    const agendaModal = document.getElementById('agendaModal');
    const agendaModalOverlay = document.getElementById('agendaModalOverlay');
    let activeEscalationId = null;

    function setDialogOpen(dialog, overlay, isOpen, trigger) {
        if (window.modalController) {
            window.modalController.setOpen(dialog, overlay, isOpen, trigger);
            return;
        }
        if (!dialog || !overlay) return;
        dialog.style.display = isOpen ? 'block' : 'none';
        dialog.setAttribute('aria-hidden', String(!isOpen));
        overlay.style.display = isOpen ? 'block' : 'none';
        if (isOpen) dialog.focus();
        else trigger?.focus();
    }

    const quickTicketTrigger = document.getElementById('quickTicketOpen');
    const ticketTypeSelect = document.getElementById('ticketType');
    const traditionalTicketForm = document.getElementById('formTicket');
    const accountTicketForm = document.getElementById('accountTicketForm');
    function synchronizeTicketType() {
        const isAccount = ticketTypeSelect?.value === 'cuenta';
        if (traditionalTicketForm) traditionalTicketForm.hidden = Boolean(isAccount);
        if (accountTicketForm) accountTicketForm.hidden = !isAccount;
        const title = document.getElementById('quickTicketTitle');
        if (title) title.textContent = isAccount ? 'Solicitar acceso institucional' : 'Crear Ticket';
        if (isAccount) window.ModalAcceso?.loadCatalogs();
    }
    ticketTypeSelect?.addEventListener('change', synchronizeTicketType);

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
        ],
        'Bloque de Asistencia': ['Asistencia']
    };
    const aliasAmbientes = {
        'Bloque A': [
            ['Aulas', 'Salones / Aulas'],
            ['Laboratorios', 'Laboratorio de Agronomía y Ambiental']
        ],
        'Bloque C': [
            ['Aulas', 'Salones / Aulas'],
            ['Bibliotecas', 'Biblioteca'],
            ['Laboratorios', 'Laboratorio de Ingeniería Civil']
        ]
    };

    ticketBloque?.addEventListener('change', () => {
        const ambientes = [
            ...(ambientesPorBloque[ticketBloque.value] || []).map(ambiente => [ambiente, ambiente]),
            ...(aliasAmbientes[ticketBloque.value] || [])
        ];
        ticketAmbiente.replaceChildren(new Option(
            ambientes.length ? 'Selecciona un ambiente...' : 'Primero selecciona un bloque...',
            ''
        ));
        ambientes.forEach(([etiqueta, valor]) => ticketAmbiente.add(new Option(etiqueta, valor)));
        ticketAmbiente.disabled = ambientes.length === 0;
        actualizarCampoNumeroAula();
    });

    quickTicketTrigger?.addEventListener('click', () => {
        const formTicket = document.getElementById('formTicket');
        formTicket?.reset();
        accountTicketForm?.reset();
        if (ticketTypeSelect) ticketTypeSelect.value = 'soporte';
        synchronizeTicketType();
        ticketBloque.value = '';
        ticketBloque.dispatchEvent(new Event('change'));
        sincronizarCampoAsignaturaDocente();
        setDialogOpen(quickTicketModal, quickTicketOverlay, true);
        document.getElementById('titulo')?.focus();
    });

    const closeQuickTicket = () => {
        window.modalController?.clearForms(quickTicketModal);
        setDialogOpen(quickTicketModal, quickTicketOverlay, false, quickTicketTrigger);
    };
    document.querySelector('[data-account-cancel]')?.addEventListener('click', closeQuickTicket);
    document.getElementById('quickTicketClose')?.addEventListener('click', closeQuickTicket);
    document.getElementById('quickTicketCancel')?.addEventListener('click', closeQuickTicket);
    quickTicketOverlay?.addEventListener('click', closeQuickTicket);

    const closeEscalation = () => setDialogOpen(escalationModal, escalationOverlay, false);
    escalationOverlay?.addEventListener('click', closeEscalation);
    document.querySelectorAll('[data-close-escalation]').forEach(button => {
        button.addEventListener('click', closeEscalation);
    });
    document.getElementById('ticketDetalle')?.addEventListener('click', event => {
        const button = event.target.closest('[data-open-escalation]');
        if (!button) return;
        activeEscalationId = Number(button.dataset.openEscalation);
        document.getElementById('escalationForm')?.reset();
        const area = document.getElementById('escalationArea');
        if (area) area.value = 'Soporte de cuentas institucionales';
        setDialogOpen(escalationModal, escalationOverlay, true);
    });

    document.getElementById('escalationForm')?.addEventListener('submit', async event => {
        event.preventDefault();
        if (!activeEscalationId) return;
        const form = event.currentTarget;
        const button = form.querySelector('button[type="submit"]');
        const area = document.getElementById('escalationArea').value.trim();
        const reason = document.getElementById('escalationReason').value.trim();
        if (!area || !reason) {
            mostrarMensaje('Indica el área de destino y el motivo del escalamiento', 'error');
            return;
        }
        button.disabled = true;
        try {
            const data = await window.CuentasApi.escalarAAbancay(
                activeEscalationId,
                `Área destino en Abancay: ${area}\n\nMotivo: ${reason}`
            );
            closeEscalation();
            mostrarMensaje(data.mensaje || 'Incidencia escalada a Abancay', 'exito');
            await cargarIncidenciasCuentas();
            await mostrarDetalleIncidenciaCuenta(activeEscalationId);
        } catch (error) {
            mostrarMensaje(error.message, 'error');
        } finally {
            button.disabled = false;
        }
    });

    document.getElementById('ticketDetalle')?.addEventListener('submit', async event => {
        const form = event.target;
        if (form.id !== 'accountSolutionForm' && form.id !== 'accountEvidenceForm') return;
        event.preventDefault();
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
            let data;
            if (form.id === 'accountSolutionForm') {
                data = await window.CuentasApi.registrarSolucion(
                    form.dataset.accountId,
                    document.getElementById('accountSolution').value.trim()
                );
            } else {
                const formData = new FormData(form);
                data = await window.CuentasApi.subirEvidencia(form.dataset.accountId, formData);
            }
            mostrarMensaje(data.mensaje || 'Incidencia actualizada', 'exito');
            await cargarIncidenciasCuentas();
            await mostrarDetalleIncidenciaCuenta(form.dataset.accountId);
        } catch (error) {
            mostrarMensaje(error.message, 'error');
        } finally {
            button.disabled = false;
        }
    });

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
        if (escalationModal?.style.display === 'block') closeEscalation();
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
                (t.categoria_nombre && t.categoria_nombre.toLowerCase().includes(query)) ||
                (t.oficina_nombre && t.oficina_nombre.toLowerCase().includes(query)) ||
                (t.id && t.id.toString().includes(query))
            );
            mostrarTickets(filtered);
            
            if(query.length > 0) {
                cambiarVista('tickets');
            }
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

    const reportMonthSelect = document.getElementById('reportMonthSelect');

    function currentReportMonth() {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Lima',
            year: 'numeric',
            month: '2-digit'
        }).formatToParts(new Date());
        const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
        return `${values.year}-${values.month}`;
    }

    function reportMonthLabel(monthKey) {
        const [year, month] = monthKey.split('-').map(Number);
        return new Date(Date.UTC(year, month - 1, 15, 12)).toLocaleDateString('es-PE', {
            month: 'long',
            year: 'numeric',
            timeZone: 'America/Lima'
        });
    }

    function reportTicketMonth(ticket) {
        const date = new Date(ticket.fecha_creacion);
        if (!Number.isFinite(date.getTime())) return '';
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Lima',
            year: 'numeric',
            month: '2-digit'
        }).formatToParts(date);
        const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
        return `${values.year}-${values.month}`;
    }

    function getReportTickets() {
        const monthKey = reportMonthSelect?.value || currentReportMonth();
        const tickets = (window.allTickets || [])
            .filter(ticket => reportTicketMonth(ticket) === monthKey)
            .map(ticket => ({
                ...ticket,
                categoria_reporte: ticket.categoria_usuario || ticket.categoria_nombre
            }));
        const accountTickets = accountIncidences
            .filter(incident => reportTicketMonth(incident) === monthKey)
            .map(incident => ({
                ...incident,
                id: `CTA-${incident.id}`,
                reportAccountId: incident.id,
                titulo: `${incident.tipo_problema || 'Solicitud de acceso'} · ${incident.plataforma || 'Cuenta institucional'}`,
                solicitante_nombre: [incident.nombres, incident.apellidos].filter(Boolean).join(' ') || '—',
                categoria_nombre: 'Cuentas institucionales',
                categoria_reporte: 'Cuentas institucionales',
                oficina_nombre: incident.oficina || 'Soporte institucional',
                tecnico: 'Soporte institucional',
                estado: incident.estado === 'RESUELTO'
                    ? 'Resuelto'
                    : incident.estado === 'ESCALADO_ABANCAY'
                        ? 'Escalado a Abancay'
                        : incident.estado || 'Nuevo',
                sla_resolved_at: incident.fecha_resolucion
            }));
        return [...tickets, ...accountTickets];
    }

    function isClosedReportTicket(ticket) {
        return ['Solucionado', 'Cerrado', 'Resuelto'].includes(ticket.estado);
    }

    function reportMeanElapsedHours(tickets, endField) {
        const durations = tickets.map(ticket => {
            const created = new Date(ticket.fecha_creacion).getTime();
            const rawEnd = ticket[endField];
            const end = typeof rawEnd === 'number' || /^\d+$/.test(String(rawEnd || ''))
                ? Number(rawEnd)
                : new Date(rawEnd).getTime();
            return Number.isFinite(created) && Number.isFinite(end) && end >= created
                ? (end - created) / 3600000
                : null;
        }).filter(value => value !== null);
        return durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : null;
    }

    function formatReportDuration(hours) {
        if (hours === null) return 'Sin datos';
        return hours >= 24 ? `${(hours / 24).toFixed(1)} días` : `${hours.toFixed(1)} h`;
    }

    function prepareReportMonths() {
        if (!reportMonthSelect) return;
        const currentMonth = currentReportMonth();
        const months = new Set([currentMonth]);
        (window.allTickets || []).forEach(ticket => {
            const month = reportTicketMonth(ticket);
            if (/^\d{4}-\d{2}$/.test(month)) months.add(month);
        });
        accountIncidences.forEach(incident => {
            const month = reportTicketMonth(incident);
            if (/^\d{4}-\d{2}$/.test(month)) months.add(month);
        });
        const selected = reportMonthSelect.value || currentMonth;
        reportMonthSelect.replaceChildren(...[...months].sort().reverse().map(month =>
            new Option(reportMonthLabel(month), month)
        ));
        reportMonthSelect.value = months.has(selected) ? selected : currentMonth;
    }

    function aggregateReportTickets(tickets, field, fallback) {
        const counts = new Map();
        tickets.forEach(ticket => {
            const label = String(ticket[field] || fallback);
            counts.set(label, (counts.get(label) || 0) + 1);
        });
        return [...counts.entries()]
            .map(([label, count]) => ({ label, count }))
            .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'es'))
            .slice(0, 8);
    }

    function renderReportBars(containerId, entries, clickable = false) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.replaceChildren();
        if (!entries.length) {
            const empty = document.createElement('p');
            empty.className = 'text-muted';
            empty.textContent = 'Sin incidencias registradas en este periodo.';
            container.appendChild(empty);
            return;
        }

        const max = Math.max(...entries.map(entry => entry.count));
        entries.forEach(({ label, count }) => {
            const item = document.createElement(clickable ? 'button' : 'div');
            if (clickable) {
                item.type = 'button';
                item.className = 'report-bar report-bar-action';
                item.dataset.reportCategory = label;
                item.setAttribute('aria-label', `Ver incidencias de ${label}`);
            } else {
                item.className = 'report-bar';
            }
            const heading = document.createElement('span');
            heading.className = 'report-bar-heading';
            const name = document.createElement('span');
            name.textContent = label;
            const value = document.createElement('strong');
            value.textContent = String(count);
            heading.append(name, value);
            const track = document.createElement('span');
            track.className = 'report-bar-track';
            const fill = document.createElement('span');
            fill.className = 'report-bar-fill';
            fill.style.width = `${Math.round(count * 100 / max)}%`;
            track.appendChild(fill);
            item.append(heading, track);
            container.appendChild(item);
        });
    }

    function renderReportDetails(tickets, monthKey) {
        const body = document.getElementById('reportTicketsBody');
        if (!body) return;
        body.replaceChildren();
        const countBadge = document.getElementById('reportMonthCount');
        if (countBadge) countBadge.textContent = `${tickets.length} ${tickets.length === 1 ? 'incidencia' : 'incidencias'}`;
        const description = document.getElementById('reportMonthDescription');
        if (description) description.textContent = `Tickets registrados en ${reportMonthLabel(monthKey)}.`;

        if (!tickets.length) {
            const row = body.insertRow();
            const cell = row.insertCell();
            cell.colSpan = 7;
            cell.className = 'report-empty-cell';
            cell.textContent = 'No hay incidencias registradas en este mes.';
            return;
        }

        tickets.forEach(ticket => {
            const row = body.insertRow();
            const createdAt = new Date(ticket.fecha_creacion);
            const dateLabel = Number.isFinite(createdAt.getTime())
                ? createdAt.toLocaleDateString('es-PE', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    timeZone: 'America/Lima'
                })
                : '—';
            [
                `#${ticket.id} · ${ticket.titulo || 'Sin asunto'}`,
                ticket.solicitante_nombre || ticket.username || '—',
                ticket.categoria_usuario || ticket.categoria_nombre || 'Sin categoría',
                ticket.prioridad || '—',
                ticket.estado || '—',
                dateLabel
            ].forEach(value => {
                row.insertCell().textContent = value;
            });
            const actionCell = row.insertCell();
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'btn-small report-open-ticket';
            if (ticket.reportAccountId) {
                button.dataset.reportAccountId = ticket.reportAccountId;
            } else {
                button.dataset.reportTicketId = ticket.id;
            }
            button.textContent = 'Abrir';
            button.setAttribute('aria-label', `Abrir ticket ${ticket.id}`);
            actionCell.appendChild(button);
        });
    }

    function renderMonthlyReport() {
        if (!reportMonthSelect) return;
        const monthKey = reportMonthSelect.value || currentReportMonth();
        const tickets = getReportTickets();
        const closed = tickets.filter(isClosedReportTicket);
        const resolutionRate = tickets.length ? Math.round(closed.length * 100 / tickets.length) : 0;

        document.getElementById('rep-kpi-total').textContent = String(tickets.length);
        document.getElementById('rep-kpi-total-note').textContent = `Incluye tickets y cuentas · ${reportMonthLabel(monthKey)}`;
        document.getElementById('rep-kpi-resueltos').textContent = String(closed.length);
        document.getElementById('rep-kpi-resueltos-note').textContent = `${resolutionRate}% de las registradas`;
        document.getElementById('rep-kpi-abiertos').textContent = String(tickets.length - closed.length);
        document.getElementById('rep-kpi-tiempo').textContent =
            formatReportDuration(reportMeanElapsedHours(closed, 'sla_resolved_at'));
        document.getElementById('rep-kpi-primera-atencion').textContent =
            formatReportDuration(reportMeanElapsedHours(tickets.filter(ticket => ticket.sla_first_response_at), 'sla_first_response_at'));
        renderReportBars('repCategoriasList', aggregateReportTickets(tickets, 'categoria_reporte', 'Sin categoría'), true);
        renderReportBars('repOficinasList', aggregateReportTickets(tickets, 'oficina_nombre', 'Sin oficina'));
        renderReportBars('repTecnicosList', aggregateReportTickets(tickets, 'tecnico', 'Sin asignar'));
        renderReportDetails(tickets, monthKey);
    }

    const summaryMonthSelect = document.getElementById('summaryMonthSelect');

    function getSummaryOpenCases() {
        const tickets = (window.allTickets || [])
            .filter(ticket => !isClosedReportTicket(ticket))
            .map(ticket => ({ ...ticket, summaryType: 'ticket' }));
        const accounts = accountIncidences
            .filter(incident => incident.estado !== 'RESUELTO')
            .map(incident => ({
                ...incident,
                id: incident.id,
                titulo: `${incident.tipo_problema || 'Solicitud de acceso'} · ${incident.plataforma || 'Cuenta institucional'}`,
                solicitante_nombre: [incident.nombres, incident.apellidos].filter(Boolean).join(' '),
                categoria_nombre: 'Cuentas institucionales',
                estado: incident.estado === 'ESCALADO_ABANCAY' ? 'Escalado a Abancay' : incident.estado || 'Nuevo',
                prioridad: incident.prioridad || 'MEDIA',
                summaryType: 'account'
            }));
        const priorityOrder = { URGENTE: 0, CRITICA: 0, CRÍTICA: 0, ALTA: 1, MEDIA: 2, BAJA: 3 };
        return [...tickets, ...accounts].sort((left, right) => {
            const priorityDifference = (priorityOrder[String(left.prioridad).toUpperCase()] ?? 4) -
                (priorityOrder[String(right.prioridad).toUpperCase()] ?? 4);
            if (priorityDifference) return priorityDifference;
            return new Date(right.fecha_creacion || 0) - new Date(left.fecha_creacion || 0);
        });
    }

    function renderSummaryOpenCases() {
        const container = document.getElementById('summaryOpenCasesList');
        const allCount = document.getElementById('summaryOpenAllCount');
        if (!container) return;
        const openCases = getSummaryOpenCases();
        if (allCount) allCount.textContent = String(openCases.length);
        container.replaceChildren();
        if (!openCases.length) {
            const empty = document.createElement('p');
            empty.className = 'text-muted';
            empty.textContent = 'No hay casos abiertos por atender.';
            container.appendChild(empty);
            return;
        }

        openCases.slice(0, 6).forEach(item => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'summary-open-case';
            button.dataset.summaryCaseType = item.summaryType;
            button.dataset.summaryCaseId = item.id;

            const details = document.createElement('span');
            details.className = 'summary-open-case-details';
            const title = document.createElement('strong');
            title.textContent = item.summaryType === 'account' ? `Cuenta #${item.id} · ${item.titulo}` : `Ticket #${item.id} · ${item.titulo || 'Sin asunto'}`;
            const metadata = document.createElement('small');
            metadata.textContent = `${item.solicitante_nombre || item.username || 'Solicitante'} · ${item.categoria_nombre || 'Sin categoría'}`;
            details.append(title, metadata);

            const badges = document.createElement('span');
            badges.className = 'summary-open-case-badges';
            const priority = document.createElement('span');
            priority.className = `summary-priority summary-priority-${String(item.prioridad).toLowerCase()}`;
            priority.textContent = item.prioridad || 'MEDIA';
            const status = document.createElement('span');
            status.className = 'summary-case-status';
            status.textContent = item.estado || 'Nuevo';
            badges.append(priority, status);
            button.append(details, badges);
            container.appendChild(button);
        });
    }

    function renderSupportSummary() {
        if (!summaryMonthSelect) return;
        const monthKey = summaryMonthSelect.value || currentReportMonth();
        const tickets = getReportTicketsForMonth(monthKey);
        const closed = tickets.filter(isClosedReportTicket);
        const open = tickets.length - closed.length;
        const rate = tickets.length ? Math.round(closed.length * 100 / tickets.length) : 0;
        const duration = reportMeanElapsedHours(closed, 'sla_resolved_at');
        const firstResponse = reportMeanElapsedHours(
            tickets.filter(ticket => ticket.sla_first_response_at),
            'sla_first_response_at'
        );

        document.getElementById('summaryTotal').textContent = String(tickets.length);
        document.getElementById('summaryResolved').textContent = String(closed.length);
        document.getElementById('summaryResolvedRate').textContent = `${rate}% de las incidencias del mes`;
        document.getElementById('summaryOpen').textContent = String(open);
        document.getElementById('summaryResolutionTime').textContent = formatReportDuration(duration);
        document.getElementById('supportProgressRate').textContent = `${rate}%`;
        document.getElementById('supportProgressResolved').textContent = String(closed.length);
        document.getElementById('supportProgressOpen').textContent = String(open);
        const ring = document.getElementById('supportProgressRing');
        ring.style.setProperty('--progress', `${rate}%`);
        ring.setAttribute('aria-label', `${rate}% de incidencias resueltas`);
        document.getElementById('supportFirstResponse').textContent =
            `Tiempo medio de primera atención: ${formatReportDuration(firstResponse)}.`;
        document.getElementById('frequentFailuresCaption').textContent =
            `Incidencias por categoría · ${reportMonthLabel(monthKey)}`;
        document.getElementById('frequentFailuresTotal').textContent =
            `${tickets.length} ${tickets.length === 1 ? 'caso' : 'casos'}`;

        const iconForCategory = label => {
            const normalized = String(label)
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase();
            if (/internet|wifi|red/.test(normalized)) return 'ph-wifi-high';
            if (/cuenta|acceso|correo/.test(normalized)) return 'ph-file-text';
            if (/pagina|web|sitio/.test(normalized)) return 'ph-globe';
            if (/fotocopiadora/.test(normalized)) return 'ph-copy';
            if (/impresora/.test(normalized)) return 'ph-printer';
            if (/proyector|ecran|multimedia|pantalla/.test(normalized)) return 'ph-presentation';
            if (/matricula|constancia|acta|nota|expediente|tramite/.test(normalized)) return 'ph-file-text';
            if (/classroom|class room|aula|plataforma virtual/.test(normalized)) return 'ph-graduation-cap';
            if (/erp|university|sistema academico|sistema de gestion/.test(normalized)) return 'ph-file-text';
            if (/\bpcs?\b|computadora|computo|laboratorio|hardware/.test(normalized)) return 'ph-desktop';
            if (/biblioteca|libro/.test(normalized)) return 'ph-books';
            if (/auditorio|audio|parlante/.test(normalized)) return 'ph-speaker-high';
            if (/asistencia|marcador|biometr/.test(normalized)) return 'ph-fingerprint';
            if (/sin categoria|sin clasificar/.test(normalized)) return 'ph-question';
            return 'ph-tag';
        };
        const failures = document.getElementById('frequentFailuresList');
        failures.replaceChildren();
        const categories = aggregateReportTickets(tickets, 'categoria_reporte', 'Sin categoría');
        if (!categories.length) {
            const empty = document.createElement('p');
            empty.className = 'text-muted';
            empty.textContent = 'No hay incidencias registradas en este periodo.';
            failures.appendChild(empty);
        } else {
            const max = categories[0].count;
            categories.forEach(({ label, count }) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'frequent-failure-row';
                button.dataset.summaryCategory = label;
                const icon = document.createElement('i');
                icon.className = `ph ${iconForCategory(label)}`;
                icon.setAttribute('aria-hidden', 'true');
                const name = document.createElement('span');
                name.className = 'frequent-failure-name';
                name.append(icon, document.createTextNode(label));
                const track = document.createElement('span');
                track.className = 'frequent-failure-track';
                const fill = document.createElement('span');
                fill.className = 'frequent-failure-fill';
                fill.style.width = `${Math.max(12, Math.round(count * 100 / max))}%`;
                track.appendChild(fill);
                const total = document.createElement('strong');
                total.className = 'frequent-failure-count';
                total.textContent = String(count);
                button.setAttribute('aria-label', `Ver ${count} incidencias de ${label}`);
                button.append(name, track, total);
                failures.appendChild(button);
            });
        }
        renderSummaryOpenCases();
    }

    function getReportTicketsForMonth(monthKey) {
        const selectedMonth = reportMonthSelect?.value;
        if (reportMonthSelect && selectedMonth !== monthKey) {
            const originalMonth = selectedMonth;
            reportMonthSelect.value = monthKey;
            const tickets = getReportTickets();
            reportMonthSelect.value = originalMonth;
            return tickets;
        }
        return getReportTickets();
    }

    summaryMonthSelect?.addEventListener('change', () => {
        if (reportMonthSelect) reportMonthSelect.value = summaryMonthSelect.value;
        renderSupportSummary();
        renderMonthlyReport();
    });

    cargarMetricasReportes = function() {
        prepareReportMonths();
        if (summaryMonthSelect) {
            const options = [...reportMonthSelect.options].map(option =>
                new Option(option.textContent, option.value)
            );
            summaryMonthSelect.replaceChildren(...options);
            summaryMonthSelect.value = reportMonthSelect.value;
        }
        renderMonthlyReport();
        renderSupportSummary();
    };
    reportMonthSelect?.addEventListener('change', () => {
        if (summaryMonthSelect) summaryMonthSelect.value = reportMonthSelect.value;
        renderMonthlyReport();
        renderSupportSummary();
    });

    document.getElementById('repCategoriasList')?.addEventListener('click', event => {
        const categoryButton = event.target.closest('[data-report-category]');
        const searchInput = document.getElementById('searchInput');
        if (!categoryButton || !searchInput) return;
        if (categoryButton.dataset.reportCategory === 'Cuentas institucionales') {
            window.cambiarVista('tickets');
            document.getElementById('accountIncidentsList')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }
        searchInput.value = categoryButton.dataset.reportCategory;
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    document.getElementById('reportTicketsBody')?.addEventListener('click', event => {
        const button = event.target.closest('[data-report-ticket-id]');
        if (button) {
            const ticket = (window.allTickets || []).find(item => Number(item.id) === Number(button.dataset.reportTicketId));
            if (ticket) window.mostrarDetalleTicket(ticket);
            return;
        }
        const accountButton = event.target.closest('[data-report-account-id]');
        if (accountButton) mostrarDetalleIncidenciaCuenta(accountButton.dataset.reportAccountId);
    });

    document.getElementById('frequentFailuresList')?.addEventListener('click', event => {
        const button = event.target.closest('[data-summary-category]');
        if (!button) return;
        const category = button.dataset.summaryCategory;
        if (category === 'Cuentas institucionales') {
            window.cambiarVista('tickets');
            document.getElementById('accountIncidentsList')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }
        const searchInput = document.getElementById('searchInput');
        if (!searchInput) return;
        window.cambiarVista('tickets');
        searchInput.value = category;
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    document.getElementById('summaryOpenCasesList')?.addEventListener('click', event => {
        const button = event.target.closest('[data-summary-case-id]');
        if (!button) return;
        if (button.dataset.summaryCaseType === 'account') {
            mostrarDetalleIncidenciaCuenta(button.dataset.summaryCaseId);
            return;
        }
        const ticket = (window.allTickets || []).find(item => Number(item.id) === Number(button.dataset.summaryCaseId));
        if (ticket) window.mostrarDetalleTicket(ticket);
    });

    document.getElementById('summaryViewAllCases')?.addEventListener('click', () => {
        window.cambiarVista('tickets');
        const activeFilter = [...document.querySelectorAll('.filter-btn')]
            .find(button => button.getAttribute('onclick')?.includes("filtrar('activos'"));
        window.filtrar('activos', { currentTarget: activeFilter });
    });

    function reportCsvCell(value) {
        return `"${String(value ?? '').replace(/"/g, '""')}"`;
    }

    window.exportarTicketsExcel = function() {
        const monthKey = reportMonthSelect?.value || currentReportMonth();
        const tickets = getReportTickets();
        if (!tickets.length) {
            mostrarMensaje('No hay tickets registrados en el mes seleccionado', 'error');
            return;
        }
        const closed = tickets.filter(isClosedReportTicket);
        const rows = [
            ['Reporte mensual de soporte UTEA', reportMonthLabel(monthKey)],
            ['Incidencias registradas', tickets.length],
            ['Casos resueltos', closed.length],
            ['Casos abiertos', tickets.length - closed.length],
            ['Tasa de resolución', `${Math.round(closed.length * 100 / tickets.length)}%`],
            [],
            ['ID', 'Asunto', 'Solicitante', 'Oficina', 'Categoría', 'Técnico', 'Prioridad', 'Estado', 'Fecha de registro'],
            ...tickets.map(ticket => [
                ticket.id, ticket.titulo, ticket.solicitante_nombre || ticket.username,
                ticket.oficina_nombre, ticket.categoria_nombre, ticket.tecnico,
                ticket.prioridad, ticket.estado, ticket.fecha_creacion
            ])
        ];
        const csv = `\uFEFF${rows.map(row => row.map(reportCsvCell).join(',')).join('\r\n')}`;
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `Reporte_UTEA_${monthKey}.csv`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    window.generarReportePDFMensual = function() {
        const monthKey = reportMonthSelect?.value || currentReportMonth();
        const tickets = getReportTickets();
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            mostrarMensaje('Permite las ventanas emergentes para generar el reporte PDF', 'error');
            return;
        }
        const closed = tickets.filter(isClosedReportTicket);
        const ticketRows = tickets.map(ticket => `
            <tr>
                <td>#${escapeHTML(ticket.id)}</td>
                <td>${escapeHTML(ticket.solicitante_nombre || ticket.username || '—')}</td>
                <td>${escapeHTML(ticket.categoria_nombre || 'Sin categoría')}</td>
                <td>${escapeHTML(ticket.titulo || 'Sin asunto')}</td>
                <td>${escapeHTML(ticket.prioridad || '—')}</td>
                <td>${escapeHTML(ticket.estado || '—')}</td>
                <td>${escapeHTML(ticket.fecha_creacion ? new Date(ticket.fecha_creacion).toLocaleDateString('es-PE', { timeZone: 'America/Lima' }) : '—')}</td>
            </tr>
        `).join('');
        printWindow.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8">
            <title>Reporte UTEA ${escapeHTML(reportMonthLabel(monthKey))}</title>
            <style>
                body{font-family:Arial,sans-serif;margin:32px;color:#1e293b}
                header{text-align:center;border-bottom:3px solid #0b3f8a;padding-bottom:16px;margin-bottom:24px}
                h1{color:#0b3f8a;font-size:22px;margin:0}header p{color:#475569;margin:8px 0 0}
                .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:20px 0}
                .kpi{padding:14px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc}
                .kpi span{display:block;color:#475569;font-size:12px}.kpi strong{display:block;color:#0b3f8a;font-size:22px;margin-top:6px}
                table{width:100%;border-collapse:collapse;font-size:11px;margin-top:16px}
                th,td{border:1px solid #cbd5e1;padding:7px;text-align:left}th{background:#f1f5f9}
            </style></head><body>
            <header><h1>Universidad Tecnológica de los Andes</h1>
            <p>Reporte mensual de soporte · Sede Andahuaylas · ${escapeHTML(reportMonthLabel(monthKey))}</p></header>
            <div class="kpis">
                <div class="kpi"><span>Incidencias del mes</span><strong>${tickets.length}</strong></div>
                <div class="kpi"><span>Casos resueltos</span><strong>${closed.length}</strong></div>
                <div class="kpi"><span>Casos abiertos</span><strong>${tickets.length - closed.length}</strong></div>
                <div class="kpi"><span>Tasa de resolución</span><strong>${tickets.length ? Math.round(closed.length * 100 / tickets.length) : 0}%</strong></div>
            </div>
            <h2>Detalle de incidencias</h2>
            <table><thead><tr><th>ID</th><th>Solicitante</th><th>Categoría</th><th>Asunto</th><th>Prioridad</th><th>Estado</th><th>Registro</th></tr></thead>
            <tbody>${ticketRows || '<tr><td colspan="7">No hay incidencias registradas en este periodo.</td></tr>'}</tbody></table>
            <script>window.onload=()=>window.print();</script></body></html>`);
        printWindow.document.close();
    };

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
    cargarIncidenciasCuentas();
    if (puedeGestionarCuentas) cargarEstadisticasCuentas();
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
