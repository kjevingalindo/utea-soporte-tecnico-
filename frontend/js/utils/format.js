export function safeText(value) {
    const fallback = value == null ? '' : String(value);
    return fallback.replace(/[<>]/g, '');
}

export function formatBytes(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / (1024 ** index);
    return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatNumber(value, fallback = 'Sin datos') {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback;
    return Number(value).toLocaleString('es-PE');
}

export function normalizePriority(value) {
    return String(value || '').trim() || 'Media';
}
