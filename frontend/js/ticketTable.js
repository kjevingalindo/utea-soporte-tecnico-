(function exposeTicketTable(global) {
    const columns = Object.freeze([
        { key: 'incident', label: 'Incidencia' },
        { key: 'requester', label: 'Solicitante' },
        { key: 'category', label: 'Categoría' },
        { key: 'location', label: 'Ubicación' },
        { key: 'priority', label: 'Prioridad' },
        { key: 'state', label: 'Estado' },
        { key: 'created', label: 'Registro' },
        { key: 'technician', label: 'Técnico asignado' },
        { key: 'actions', label: 'Acciones' }
    ]);

    function displayValue(value, fallback) {
        return typeof value === 'string' && value.trim() ? value.trim() : fallback;
    }

    function requesterType(ticket) {
        const value = String(ticket.tipo_solicitante || ticket.tipo_usuario || '').trim().toLowerCase();
        const labels = {
            estudiante: 'Estudiante',
            administrativo: 'Administrativo',
            docente: 'Docente',
            oficina: 'Oficina'
        };
        return labels[value] || 'No registrado';
    }

    function formatDate(value) {
        if (!value) return 'No registrado';
        const normalized = typeof value === 'string' ? value.replace(' ', 'T') : value;
        const date = new Date(normalized);
        return Number.isNaN(date.getTime())
            ? 'No registrado'
            : date.toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' });
    }

    function location(ticket) {
        if (typeof ticket.ubicacion === 'string' && ticket.ubicacion.trim()) {
            return ticket.ubicacion.trim();
        }
        const parts = [
            ticket.oficina_nombre || ticket.oficina,
            ticket.bloque,
            ticket.ambiente,
            ticket.aula ? `Aula ${ticket.aula}` : ''
        ].filter(value => typeof value === 'string' && value.trim());
        return parts.length ? parts.join(' · ') : 'No registrada';
    }

    function valuesFor(ticket) {
        const reference = ticket.reportReference || `#${ticket.id}`;
        return {
            incident: { reference, title: displayValue(ticket.titulo, 'Asunto no registrado') },
            requester: {
                name: displayValue(ticket.solicitante_nombre, 'No registrado'),
                type: requesterType(ticket)
            },
            category: displayValue(
                ticket.categoria_reporte || ticket.categoria_usuario || ticket.categoria_nombre,
                'Sin categoría'
            ),
            location: location(ticket),
            priority: displayValue(ticket.prioridad, 'No registrada'),
            state: displayValue(ticket.estado, 'Sin estado'),
            created: formatDate(ticket.fecha_creacion),
            technician: displayValue(ticket.tecnico, 'Sin asignar')
        };
    }

    function paginate(items, requestedPage, pageSize) {
        const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
        const page = Math.min(Math.max(1, requestedPage), totalPages);
        const startIndex = (page - 1) * pageSize;
        return {
            items: items.slice(startIndex, startIndex + pageSize),
            page,
            total: items.length,
            totalPages,
            start: items.length ? startIndex + 1 : 0,
            end: Math.min(items.length, startIndex + pageSize)
        };
    }

    function createHeader(container) {
        container.replaceChildren(...columns.map(column => {
            const cell = document.createElement('div');
            cell.className = `ticket-header-cell ticket-column-${column.key}`;
            cell.textContent = column.label;
            return cell;
        }));
    }

    function createActionButton(label, title, handler) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn-action-icon';
        button.title = title;
        button.setAttribute('aria-label', title);
        button.textContent = label;
        button.addEventListener('click', handler);
        return button;
    }

    function render(container, tickets, options) {
        container.replaceChildren();
        if (!tickets.length) {
            const empty = document.createElement('p');
            empty.className = 'tickets-empty-state';
            empty.textContent = 'No hay incidencias que coincidan con los filtros seleccionados.';
            container.appendChild(empty);
            return;
        }

        tickets.forEach(ticket => {
            const row = document.createElement('div');
            row.className = 'ticket-row';
            row.addEventListener('click', event => {
                if (event.target.closest('button')) return;
                if (String(ticket.id).startsWith('CTA-')) options.onOpenAccount(ticket.reportAccountId);
                else options.onOpenTicket(ticket);
            });

            const values = valuesFor(ticket);
            columns.forEach(column => {
                const cell = document.createElement('div');
                cell.className = `ticket-cell ticket-column-${column.key}`;
                const value = values[column.key];
                if (column.key === 'incident') {
                    const reference = document.createElement('strong');
                    reference.textContent = value.reference;
                    const title = document.createElement('span');
                    title.textContent = value.title;
                    cell.append(reference, title);
                } else if (column.key === 'requester') {
                    const name = document.createElement('span');
                    name.textContent = value.name;
                    const type = document.createElement('small');
                    type.textContent = value.type;
                    cell.append(name, type);
                } else if (column.key === 'priority') {
                    cell.classList.add('t-priority', options.getPriorityClass(ticket.prioridad));
                    cell.textContent = value;
                } else if (column.key === 'state') {
                    cell.classList.add('t-status', options.getStateClass(ticket.estado));
                    cell.textContent = value;
                    const sla = options.getSlaStatus(ticket);
                    if (sla) {
                        const detail = document.createElement('small');
                        detail.textContent = sla;
                        cell.appendChild(detail);
                    }
                    if (ticket.fecha_programada_iso) {
                        const schedule = document.createElement('small');
                        schedule.textContent = `Solución prevista: ${ticket.fecha_programada_iso}`;
                        cell.appendChild(schedule);
                    }
                } else if (column.key === 'actions') {
                    cell.classList.add('ticket-actions');
                    cell.appendChild(createActionButton('Abrir', 'Abrir detalle', () => {
                        if (String(ticket.id).startsWith('CTA-')) options.onOpenAccount(ticket.reportAccountId);
                        else options.onOpenTicket(ticket);
                    }));
                    if (ticket.reportAccountId && !String(ticket.id).startsWith('CTA-')) {
                        cell.appendChild(createActionButton('Cuenta', 'Abrir incidencia de cuenta', () =>
                            options.onOpenAccount(ticket.reportAccountId)
                        ));
                    }
                    if (options.canManage && !String(ticket.id).startsWith('CTA-')) {
                        cell.append(
                            createActionButton('Resolver', 'Resolver', () => options.onResolve(ticket.id)),
                            createActionButton('Eliminar', 'Eliminar', () => options.onDelete(ticket.id)),
                            createActionButton('Editar', 'Editar', () => options.onEdit(ticket)),
                            createActionButton('Notas', 'Notas', () => options.onComments(ticket.id))
                        );
                    }
                } else {
                    cell.textContent = value;
                }
                row.appendChild(cell);
            });
            container.appendChild(row);
        });
    }

    global.UTEATicketTable = Object.freeze({ columns, valuesFor, paginate, createHeader, render });
    if (typeof module !== 'undefined' && module.exports) module.exports = global.UTEATicketTable;
})(typeof window === 'undefined' ? globalThis : window);
