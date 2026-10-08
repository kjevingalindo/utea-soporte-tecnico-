export function isBlank(value) {
    return value === null || value === undefined || String(value).trim() === '';
}

export function isPositiveInteger(value) {
    return Number.isInteger(Number(value)) && Number(value) > 0;
}

export function validateRequiredField(value, label) {
    if (isBlank(value)) {
        return `${label} es obligatorio.`;
    }
    return '';
}
