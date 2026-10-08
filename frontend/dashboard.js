export function initializeDashboardCalendar() {
    if (!window.UTEAAccessControl?.canListAllTickets(window.UTEAIdentity)) return;
    const calendar = document.getElementById('incidentCalendarGrid');
    if (!calendar) return;
    if (calendar.dataset.calendarInitialized === 'true') return;
    calendar.dataset.calendarInitialized = 'true';

    const monthDisplay = document.getElementById('monthDisplay');
    const selectedDateDisplay = document.getElementById('calendarSelectedDate');
    const dayCountDisplay = document.getElementById('calendarDayCount');
    const dayTicketsContainer = document.getElementById('calendarDayTickets');
    const headers = Array.from(calendar.querySelectorAll('.cal-day-header'));
    let tickets = Array.isArray(window.allTickets) ? window.allTickets : [];
    let currentMonth = new Date();
    let selectedDate = getDateKey(new Date());

    function getDateKey(value) {
        const date = value instanceof Date ? value : new Date(value);
        if (!Number.isFinite(date.getTime())) return '';
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Lima',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).formatToParts(date);
        const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
        return `${values.year}-${values.month}-${values.day}`;
    }

    function getTicketDateKey(ticket) {
        const value = ticket.fecha_creacion || ticket.created_at;
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
        return value ? getDateKey(value) : '';
    }

    function ticketsForDate(dateKey) {
        return tickets.filter(ticket => getTicketDateKey(ticket) === dateKey);
    }

    function volumeClass(count) {
        if (count >= 6) return 'volume-high';
        if (count >= 3) return 'volume-medium';
        if (count > 0) return 'volume-low';
        return 'volume-none';
    }

    function renderSelectedDay() {
        const dayTickets = ticketsForDate(selectedDate);
        const selectedDateObject = new Date(`${selectedDate}T12:00:00`);
        selectedDateDisplay.textContent = selectedDateObject.toLocaleDateString('es-PE', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });
        dayCountDisplay.textContent = `${dayTickets.length} ${dayTickets.length === 1 ? 'ticket' : 'tickets'}`;
        dayTicketsContainer.replaceChildren();

        if (!dayTickets.length) {
            const emptyMessage = document.createElement('p');
            emptyMessage.className = 'text-muted';
            emptyMessage.textContent = 'No hay tickets creados en esta fecha.';
            dayTicketsContainer.appendChild(emptyMessage);
            return;
        }

        dayTickets.forEach(ticket => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'calendar-ticket-item';
            item.dataset.ticketId = ticket.id;

            const title = document.createElement('span');
            title.textContent = `#${ticket.id} ${ticket.titulo || 'Ticket sin asunto'}`;
            const status = document.createElement('span');
            status.className = 'calendar-ticket-status';
            status.textContent = ticket.estado || 'Creado';
            item.append(title, status);
            dayTicketsContainer.appendChild(item);
        });
    }

    function renderCalendar() {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const monthName = currentMonth.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
        monthDisplay.textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);
        calendar.replaceChildren(...headers);

        const firstWeekday = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const todayKey = getDateKey(new Date());

        for (let index = 0; index < firstWeekday; index += 1) {
            const blank = document.createElement('div');
            blank.className = 'cal-day cal-day-empty';
            blank.setAttribute('aria-hidden', 'true');
            calendar.appendChild(blank);
        }

        for (let day = 1; day <= daysInMonth; day += 1) {
            const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayTickets = ticketsForDate(dateKey);
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = 'cal-day incident-calendar-day';
            cell.dataset.calendarDate = dateKey;
            cell.setAttribute('aria-pressed', String(dateKey === selectedDate));
            cell.setAttribute('aria-label', `${day} de ${monthName}, ${dayTickets.length} ${dayTickets.length === 1 ? 'ticket' : 'tickets'}`);
            if (dateKey === todayKey) cell.classList.add('today');
            if (dateKey === selectedDate) cell.classList.add('selected');

            const dayNumber = document.createElement('span');
            dayNumber.className = 'calendar-day-number';
            dayNumber.textContent = day;
            const badge = document.createElement('span');
            badge.className = `ticket-count-badge ${volumeClass(dayTickets.length)}`;
            badge.textContent = dayTickets.length;
            cell.append(dayNumber, badge);
            calendar.appendChild(cell);
        }

        renderSelectedDay();
    }

    document.getElementById('prevMonth')?.addEventListener('click', () => {
        currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
        renderCalendar();
    });
    document.getElementById('nextMonth')?.addEventListener('click', () => {
        currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
        renderCalendar();
    });
    calendar.addEventListener('click', event => {
        const dayButton = event.target.closest('[data-calendar-date]');
        if (!dayButton) return;
        selectedDate = dayButton.dataset.calendarDate;
        renderCalendar();
    });
    dayTicketsContainer.addEventListener('click', event => {
        const item = event.target.closest('[data-ticket-id]');
        if (!item) return;
        const ticket = tickets.find(entry => Number(entry.id) === Number(item.dataset.ticketId));
        if (ticket && typeof window.mostrarDetalleTicket === 'function') window.mostrarDetalleTicket(ticket);
    });
    window.addEventListener('tickets:loaded', event => {
        tickets = Array.isArray(event.detail) ? event.detail : [];
        renderCalendar();
    });

    renderCalendar();
}
