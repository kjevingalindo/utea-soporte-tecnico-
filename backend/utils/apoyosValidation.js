const { AMBIENTES_POR_BLOQUE } = require('./ticketValidation');

const TIPOS_APOYO_VALIDOS = Object.freeze([
    'proyector',
    'laptop',
    'sonido',
    'microfonos',
    'internet',
    'iluminacion',
    'grabacion',
    'asistencia_permanente'
]);

const ESTADOS_APOYO_VALIDOS = Object.freeze([
    'Recibida',
    'En revision',
    'Observada',
    'Aprobada',
    'Programada',
    'En atencion',
    'Finalizada',
    'Rechazada',
    'Cancelada',
    'Impedida'
]);

const TRANSICIONES_APOYO_PERMITIDAS = Object.freeze({
    'Recibida': new Set(['En revision', 'Observada', 'Aprobada', 'Programada', 'Rechazada', 'Cancelada']),
    'En revision': new Set(['Observada', 'Aprobada', 'Programada', 'Rechazada', 'Cancelada']),
    'Observada': new Set(['En revision', 'Rechazada', 'Cancelada']),
    'Aprobada': new Set(['Programada', 'Cancelada']),
    'Programada': new Set(['Programada', 'En atencion', 'Impedida', 'Cancelada']),
    'En atencion': new Set(['Finalizada', 'Impedida', 'Cancelada']),
    'Finalizada': new Set([]),
    'Rechazada': new Set([]),
    'Cancelada': new Set([]),
    'Impedida': new Set([])
});

function esTextoValido(val, minLen = 1, maxLen = 255) {
    if (typeof val !== 'string') return false;
    const trimmed = val.trim();
    return trimmed.length >= minLen && trimmed.length <= maxLen;
}

function esHoraValida(horaStr) {
    if (typeof horaStr !== 'string') return false;
    return /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/.test(horaStr.trim());
}

function normalizarHora(horaStr) {
    const parts = horaStr.trim().split(':');
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:00`;
}

function horaAMinutos(horaStr) {
    const [h, m] = horaStr.split(':').map(Number);
    return h * 60 + m;
}

function validarSolicitudApoyo(body, file) {
    if (!body || typeof body !== 'object') {
        return { error: 'El cuerpo de la solicitud no es válido' };
    }

    const {
        solicitante_contacto,
        area_organizadora,
        responsable_evento,
        nombre_actividad,
        descripcion,
        bloque,
        ambiente,
        fecha_evento,
        hora_inicio,
        hora_fin,
        hora_preparacion,
        apoyos_requeridos,
        equipos_recursos,
        observaciones
    } = body;

    if (!esTextoValido(solicitante_contacto, 3, 255)) {
        return { error: 'El contacto del solicitante es obligatorio (3-255 caracteres)' };
    }
    if (!esTextoValido(area_organizadora, 3, 255)) {
        return { error: 'El área organizadora es obligatoria (3-255 caracteres)' };
    }
    if (!esTextoValido(responsable_evento, 3, 255)) {
        return { error: 'El nombre y cargo del responsable del evento son obligatorios' };
    }
    if (!esTextoValido(nombre_actividad, 4, 255)) {
        return { error: 'El nombre de la actividad o evento es obligatorio (4-255 caracteres)' };
    }
    if (!esTextoValido(descripcion, 10, 3000)) {
        return { error: 'La descripción de la actividad debe contener al menos 10 caracteres' };
    }

    if (!Object.prototype.hasOwnProperty.call(AMBIENTES_POR_BLOQUE, bloque) ||
        !AMBIENTES_POR_BLOQUE[bloque].includes(ambiente)) {
        return { error: 'Selecciona un bloque y ambiente válidos según el catálogo de la sede' };
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha_evento || '').trim())) {
        return { error: 'La fecha del evento debe tener formato AAAA-MM-DD' };
    }

    if (!esHoraValida(hora_inicio) || !esHoraValida(hora_fin) || !esHoraValida(hora_preparacion)) {
        return { error: 'Las horas de inicio, fin y preparación deben ser válidas (formato HH:MM)' };
    }

    const minPrep = horaAMinutos(hora_preparacion);
    const minInicio = horaAMinutos(hora_inicio);
    const minFin = horaAMinutos(hora_fin);

    if (minPrep >= minInicio) {
        return { error: 'La hora de preparación y pruebas debe programarse antes de la hora de inicio' };
    }
    if (minInicio >= minFin) {
        return { error: 'La hora de inicio debe ser anterior a la hora de finalización del evento' };
    }

    let apoyos = apoyos_requeridos;
    if (typeof apoyos === 'string') {
        try {
            apoyos = JSON.parse(apoyos);
        } catch (_) {
            apoyos = apoyos.split(',').map(s => s.trim());
        }
    }
    if (!Array.isArray(apoyos) || apoyos.length === 0) {
        return { error: 'Debe seleccionar al menos un tipo de apoyo técnico requerido' };
    }

    if (!file) {
        return { error: 'El documento de autorización en PDF, JPG o PNG es obligatorio' };
    }

    const allowedMimes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!allowedMimes.includes(file.mimetype)) {
        return { error: 'El archivo de autorización debe ser PDF, JPG, PNG o WEBP' };
    }
    if (file.size > 10 * 1024 * 1024) {
        return { error: 'El archivo de autorización no debe superar los 10 MB' };
    }

    return {
        valid: true,
        data: {
            solicitante_contacto: solicitante_contacto.trim(),
            area_organizadora: area_organizadora.trim(),
            responsable_evento: responsable_evento.trim(),
            nombre_actividad: nombre_actividad.trim(),
            descripcion: descripcion.trim(),
            bloque: bloque.trim(),
            ambiente: ambiente.trim(),
            fecha_evento: fecha_evento.trim(),
            hora_inicio: normalizarHora(hora_inicio),
            hora_fin: normalizarHora(hora_fin),
            hora_preparacion: normalizarHora(hora_preparacion),
            apoyos_requeridos: JSON.stringify(apoyos),
            equipos_recursos: equipos_recursos ? String(equipos_recursos).trim() : null,
            observaciones: observaciones ? String(observaciones).trim() : null
        }
    };
}

module.exports = {
    TIPOS_APOYO_VALIDOS,
    ESTADOS_APOYO_VALIDOS,
    TRANSICIONES_APOYO_PERMITIDAS,
    validarSolicitudApoyo,
    horaAMinutos,
    normalizarHora,
    esHoraValida
};

