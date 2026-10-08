(function exposeReportMetrics(global) {
    function timestamp(value) {
        if (value instanceof Date) return value.getTime();
        if (typeof value === 'number' || /^\d+$/.test(String(value || ''))) {
            const numeric = Number(value);
            return Number.isFinite(numeric) && numeric > 0
                ? (numeric < 100000000000 ? numeric * 1000 : numeric)
                : NaN;
        }
        if (typeof value !== 'string' || !value.trim()) return NaN;
        const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
            ? `${value}T00:00:00-05:00`
            : /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
                ? `${value.replace(' ', 'T')}-05:00`
                : value;
        return Date.parse(normalized);
    }

    function month(value) {
        const time = timestamp(value);
        if (!Number.isFinite(time)) return '';
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Lima',
            year: 'numeric',
            month: '2-digit'
        }).formatToParts(new Date(time));
        const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
        return `${values.year}-${values.month}`;
    }

    function mergeLinkedAccountIncidents(tickets, incidents) {
        const ticketById = new Map(tickets.map(ticket => [Number(ticket.id), ticket]));
        const accountByTicket = new Map();
        const independentAccounts = [];
        incidents.forEach(incident => {
            const linkedTicket = incident.ticket_id ? ticketById.get(Number(incident.ticket_id)) : null;
            if (linkedTicket) accountByTicket.set(Number(linkedTicket.id), incident);
            else independentAccounts.push(incident);
        });
        return {
            tickets: tickets.map(ticket => {
                const account = accountByTicket.get(Number(ticket.id));
                return account ? {
                    ...ticket,
                    reportAccountId: account.id,
                    account_estado: account.estado,
                    account_fecha_resolucion: account.fecha_resolucion,
                    reportReference: `#${ticket.id} · Cuenta #${account.id}`
                } : { ...ticket, reportReference: `#${ticket.id}` };
            }),
            independentAccounts
        };
    }

    function aggregateCategories(cases) {
        const counts = new Map();
        cases.forEach(item => {
            const label = String(item.categoria_reporte || item.categoria_usuario || item.categoria_nombre || 'Sin categoría');
            counts.set(label, (counts.get(label) || 0) + 1);
        });
        return [...counts.entries()]
            .map(([label, count]) => ({ label, count }))
            .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'es'))
            .slice(0, 8);
    }

    function filterCategoryAndMonth(cases, category, monthKey) {
        return cases.filter(item => {
            const label = String(item.categoria_reporte || item.categoria_usuario || item.categoria_nombre || 'Sin categoría');
            return label === category && month(item.fecha_creacion) === monthKey;
        });
    }

    function meanElapsedHours(items, endTimestamp) {
        const durations = items.map(item => {
            const createdAt = timestamp(item.fecha_creacion);
            const resolvedAt = timestamp(endTimestamp(item));
            return Number.isFinite(createdAt) && Number.isFinite(resolvedAt) && resolvedAt >= createdAt
                ? (resolvedAt - createdAt) / 3600000
                : null;
        }).filter(value => value !== null);
        return durations.length
            ? durations.reduce((sum, duration) => sum + duration, 0) / durations.length
            : null;
    }

    const api = Object.freeze({
        timestamp,
        month,
        mergeLinkedAccountIncidents,
        aggregateCategories,
        filterCategoryAndMonth,
        meanElapsedHours
    });
    global.ReportMetrics = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
