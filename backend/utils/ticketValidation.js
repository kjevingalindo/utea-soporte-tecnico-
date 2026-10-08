const { UTEA_PREGRADO_CARRERAS } = require('./uteaConfig');

const CATEGORIAS_USUARIO_VALIDAS = new Set([
    'Internet',
    'Cuentas institucionales',
    'Páginas web',
    'PC',
    'Impresoras',
    'Fotocopiadoras',
    'Classroom',
    'ERP University'
]);

const IMPACTOS_VALIDOS = new Set(['Bajo', 'Medio', 'Alto', 'Critico']);
const URGENCIAS_VALIDAS = new Set(['Baja', 'Media', 'Alta', 'Critica']);
const AMBIENTES_POR_BLOQUE = Object.freeze({
    'Bloque A': Object.freeze([
        'Salones / Aulas',
        'Laboratorio de Agronomía y Ambiental',
        'Auditorio',
        'Centro de Cómputo'
    ]),
    'Bloque B': Object.freeze([
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
    ]),
    'Bloque C': Object.freeze([
        'Sala de Docentes',
        'Salones / Aulas',
        'Biblioteca',
        'Laboratorio de Ingeniería Civil'
    ]),
    'Bloque de Asistencia': Object.freeze(['Asistencia'])
});

function textoValido(value, maxLength) {
    return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength;
}

function enteroPositivo(value) {
    return (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))) &&
        Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

function validateTicketCreation(body) {
    const value = body || {};
    const requiredText = [
        ['titulo', 255, 'El título es obligatorio y debe tener como máximo 255 caracteres'],
        ['descripcion', 10000, 'La descripción es obligatoria y debe tener como máximo 10000 caracteres'],
        ['solicitante_nombre', 150, 'El nombre del solicitante es obligatorio y no puede superar 150 caracteres'],
        ['codigo_universitario_dni', 40, 'El código universitario o DNI es obligatorio y no puede superar 40 caracteres'],
        ['tipo_solicitante', 32, 'El tipo de solicitante no es válido'],
        ['categoria_usuario', 80, 'La categoría de soporte es obligatoria y no es válida'],
        ['carrera', 120, 'La carrera o programa es obligatorio y no es válido'],
        ['bloque', 20, 'El bloque es obligatorio y no es válido'],
        ['ambiente', 180, 'El ambiente es obligatorio y no es válido']
    ];
    for (const [field, maxLength, message] of requiredText) {
        if (!textoValido(value[field], maxLength)) return { error: message };
    }

    if (!['estudiante', 'docente', 'administrativo'].includes(value.tipo_solicitante)) {
        return { error: 'El tipo de solicitante no es válido' };
    }
    if (!CATEGORIAS_USUARIO_VALIDAS.has(value.categoria_usuario)) {
        return { error: 'La categoría de soporte seleccionada no es válida' };
    }
    if (!UTEA_PREGRADO_CARRERAS.includes(value.carrera.trim())) {
        return { error: 'La carrera seleccionada no es válida para la UTEA' };
    }
    if (!Object.prototype.hasOwnProperty.call(AMBIENTES_POR_BLOQUE, value.bloque) ||
        !AMBIENTES_POR_BLOQUE[value.bloque].includes(value.ambiente)) {
        return { error: 'Selecciona un bloque y un ambiente válido para la sede' };
    }
    if (!IMPACTOS_VALIDOS.has(value.impacto) || !URGENCIAS_VALIDAS.has(value.urgencia)) {
        return { error: 'El impacto o la urgencia seleccionados no son válidos' };
    }
    if (value.tipo_solicitante === 'docente' &&
        !textoValido(value.asignatura_area, 160)) {
        return { error: 'Debes indicar la asignatura o área del docente' };
    }
    if (value.asignatura_area != null &&
        (typeof value.asignatura_area !== 'string' || value.asignatura_area.trim().length > 160)) {
        return { error: 'La asignatura o área no puede superar 160 caracteres' };
    }
    if (!enteroPositivo(value.oficina_id) || !enteroPositivo(value.categoria_id)) {
        return { error: 'Selecciona una oficina y categoría válidas' };
    }
    if (value.ubicacion != null &&
        (typeof value.ubicacion !== 'string' || value.ubicacion.trim().length > 255)) {
        return { error: 'La ubicación no puede superar 255 caracteres' };
    }

    let aula = null;
    if (value.aula !== undefined && value.aula !== null && value.aula !== '') {
        if (!enteroPositivo(value.aula) || Number(value.aula) > 9999 || value.ambiente !== 'Salones / Aulas') {
            return { error: 'El número de aula no es válido para el ambiente seleccionado' };
        }
        aula = Number(value.aula);
    }
    if (value.ambiente === 'Salones / Aulas' && aula === null) {
        return { error: 'Debes indicar el número de aula' };
    }

    return {
        value: {
            ...value,
            titulo: value.titulo.trim(),
            descripcion: value.descripcion.trim(),
            solicitante_nombre: value.solicitante_nombre.trim(),
            codigo_universitario_dni: value.codigo_universitario_dni.trim(),
            carrera: value.carrera.trim(),
            asignatura_area: value.tipo_solicitante === 'docente' ? value.asignatura_area.trim() : null,
            ubicacion: [value.bloque, value.ambiente, aula === null ? '' : `Aula ${aula}`].filter(Boolean).join(' - '),
            oficina_id: Number(value.oficina_id),
            categoria_id: Number(value.categoria_id),
            aula
        }
    };
}

module.exports = { validateTicketCreation, AMBIENTES_POR_BLOQUE };
