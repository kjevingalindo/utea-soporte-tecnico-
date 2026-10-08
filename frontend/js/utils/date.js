export function formatDateForDisplay(value, options = {}) {
    if (!value) return 'Sin datos';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Sin datos';
    const defaults = {
        timeZone: 'America/Lima',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    };
    return new Intl.DateTimeFormat('es-PE', { ...defaults, ...options }).format(date);
}

export function formatShortDate(value) {
    return formatDateForDisplay(value, { month: 'short', day: 'numeric' });
}

export function getMonthWindowLima() {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Lima',
        year: 'numeric',
        month: '2-digit'
    });
    const parts = formatter.formatToParts(now);
    const lookup = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
    const year = Number(lookup.year || now.getFullYear());
    const month = Number(lookup.month || now.getMonth() + 1);
    const start = new Date(Date.UTC(year, month - 1, 1, 5));
    const end = new Date(Date.UTC(year, month, 1, 5));
    return { start, end };
}
