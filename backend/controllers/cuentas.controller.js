const fs = require('fs');
const { success, error } = require('../utils/responseHandler');
const cuentasService = require('../services/cuentas.service');

const STAFF_ROLES = new Set(['admin', 'superadmin', 'tecnico', 'adminti']);
const uploadDirectory = require('path').resolve(__dirname, '../uploads/cuentas');

function texto(value, maxLength, { required = false } = {}) {
    if (typeof value !== 'string') return required ? null : '';
    const normalized = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
    if (!normalized && required) return null;
    return normalized.length <= maxLength ? normalized : null;
}

function enteroPositivo(value, { optional = false } = {}) {
    if (optional && (value === undefined || value === null || value === '')) return null;
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
}

async function removeUploadedFile(req) {
    if (!req.file) return;
    try {
        await fs.promises.unlink(req.file.path);
    } catch (cleanupError) {
        if (cleanupError.code !== 'ENOENT') {
            console.error('No se pudo eliminar la evidencia temporal:', cleanupError.message);
        }
    }
}

function contieneCredenciales(body) {
    return Object.keys(body || {}).some(key => /password|contrase(?:n|ñ)a|clave/i.test(key));
}

function asyncHandler(handler, { cleanupUploadedFile = false } = {}) {
    return (req, res, next) => {
        Promise.resolve(handler(req, res, next)).catch(async err => {
            if (cleanupUploadedFile && req.file) {
                try {
                    await fs.promises.unlink(req.file.path);
                } catch (cleanupError) {
                    if (cleanupError.code !== 'ENOENT') {
                        console.error('No se pudo eliminar la evidencia temporal:', cleanupError.message);
                    }
                }
            }
            next(err);
        });
    };
}

function rechazarCredenciales(req, res, next) {
    if (contieneCredenciales(req.body)) {
        if (req.file) {
            fs.promises.unlink(req.file.path).catch(cleanupError => {
                if (cleanupError.code !== 'ENOENT') {
                    console.error('No se pudo eliminar la evidencia temporal:', cleanupError.message);
                }
            });
        }
        return error(res, 'Este módulo no recibe ni almacena contraseñas o claves', 400);
    }
    return next();
}

async function listarPlataformas(req, res) {
    const data = await cuentasService.getPlatforms();
    return success(res, data);
}

async function listarFacultades(req, res) {
    const data = await cuentasService.getFaculties();
    return success(res, data);
}

async function crearPlataforma(req, res) {
    const nombre = texto(req.body?.nombre, 150, { required: true });
    const descripcion = req.body?.descripcion == null ? null : texto(req.body.descripcion, 1000);
    const activo = req.body?.activo === undefined ? true : req.body.activo;
    if (!nombre || descripcion === '' ||
        (typeof activo !== 'boolean' && ![0, 1, '0', '1'].includes(activo))) {
        return error(res, 'El nombre, descripción o estado de la plataforma no son válidos', 400);
    }

    const data = await cuentasService.createPlatform({
        nombre,
        descripcion,
        activo: activo === true || activo === 1 || activo === '1'
    });
    return success(res, data, 'Plataforma creada correctamente', 201);
}

async function crearIncidencia(req, res) {
    if (contieneCredenciales(req.body)) {
        await removeUploadedFile(req);
        return error(res, 'Este módulo no recibe ni almacena contraseñas o claves', 400);
    }

    const body = req.body || {};
    const plataformaId = enteroPositivo(body.plataforma_id);
    const oficinaId = enteroPositivo(body.oficina_id, { optional: true });
    const ticketId = enteroPositivo(body.ticket_id, { optional: true });
    const tipoUsuario = texto(body.tipo_usuario, 50, { required: true });
    const dniCodigo = texto(body.dni_codigo, 40, { required: true });
    const nombres = texto(body.nombres, 150, { required: true });
    const apellidos = texto(body.apellidos, 150, { required: true });
    const correo = body.correo_alternativo == null || body.correo_alternativo === ''
        ? null
        : texto(body.correo_alternativo, 254);
    const telefono = body.telefono == null || body.telefono === '' ? null : texto(body.telefono, 30);
    const facultad = body.facultad == null || body.facultad === '' ? null : texto(body.facultad, 150);
    const tipoProblema = texto(body.tipo_problema, 150, { required: true });
    const descripcion = texto(body.descripcion, 10000, { required: true });
    const prioridad = body.prioridad === undefined ? 'MEDIA' : texto(body.prioridad, 20);
    const prioridadesValidas = ['BAJA', 'MEDIA', 'ALTA', 'URGENTE'];

    if (!plataformaId || (oficinaId === null && body.oficina_id != null && body.oficina_id !== '') ||
        (ticketId === null && body.ticket_id != null && body.ticket_id !== '') ||
        !tipoUsuario || !dniCodigo || !nombres || !apellidos || !tipoProblema || !descripcion ||
        (body.correo_alternativo != null && body.correo_alternativo !== '' && !correo) ||
        (body.telefono != null && body.telefono !== '' && !telefono) ||
        (body.facultad != null && body.facultad !== '' && !facultad) ||
        !prioridadesValidas.includes(String(prioridad).toUpperCase())) {
        await removeUploadedFile(req);
        return error(res, 'Revisa los campos obligatorios y sus formatos', 400);
    }
    if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
        await removeUploadedFile(req);
        return error(res, 'El correo alternativo no es válido', 400);
    }

    const data = await cuentasService.createIncident({
        plataforma_id: plataformaId,
        oficina_id: oficinaId,
        ticket_id: ticketId,
        usuario_id: req.user.id,
        tipo_usuario: tipoUsuario,
        dni_codigo: dniCodigo,
        nombres,
        apellidos,
        correo_alternativo: correo,
        telefono,
        facultad,
        tipo_problema: tipoProblema,
        descripcion,
        prioridad: String(prioridad).toUpperCase(),
        file: req.file
    });
    return success(res, data, 'Incidencia registrada correctamente', 201);
}

async function listarIncidencias(req, res) {
    const filters = [];
    const values = [];
    if (req.query.plataforma !== undefined) {
        const platform = enteroPositivo(req.query.plataforma);
        if (!platform) return error(res, 'El filtro plataforma no es válido', 400);
        filters.push('ic.plataforma_id = ?');
        values.push(platform);
    }
    if (req.query.estado !== undefined) {
        const state = texto(req.query.estado, 40, { required: true });
        if (!state) return error(res, 'El filtro estado no es válido', 400);
        filters.push('ic.estado = ?');
        values.push(state.toUpperCase());
    }
    if (req.query.tipo_usuario !== undefined) {
        const userType = texto(req.query.tipo_usuario, 50, { required: true });
        if (!userType) return error(res, 'El filtro tipo_usuario no es válido', 400);
        filters.push('ic.tipo_usuario = ?');
        values.push(userType);
    }
    if (req.query.fecha !== undefined) {
        const date = req.query.fecha;
        const parsed = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
            ? new Date(`${date}T00:00:00Z`)
            : null;
        if (!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
            return error(res, 'El filtro fecha debe tener formato YYYY-MM-DD', 400);
        }
        filters.push('ic.fecha_creacion >= ? AND ic.fecha_creacion < DATE_ADD(?, INTERVAL 1 DAY)');
        values.push(date, date);
    }

    const data = await cuentasService.listIncidents({
        user: req.user,
        staffRoles: STAFF_ROLES,
        filters,
        values
    });
    return success(res, data);
}

async function obtenerIncidencia(req, res) {
    const id = enteroPositivo(req.params.id);
    if (!id) return error(res, 'El identificador de la incidencia no es válido', 400);

    const data = await cuentasService.getIncident(id);
    if (!data) return error(res, 'No se encontró la incidencia', 404);
    if (!STAFF_ROLES.has(String(req.user.rol || '').toLowerCase()) &&
        Number(data.incidencia.usuario_id) !== Number(req.user.id)) {
        return error(res, 'No tienes permisos para acceder a esta incidencia', 403);
    }
    return success(res, data);
}

async function escalarIncidencia(req, res) {
    const id = enteroPositivo(req.params.id);
    const motivo = texto(req.body?.motivo, 5000, { required: true });
    if (!id || !motivo) {
        return error(res, 'Indica una incidencia y un motivo de escalamiento válidos', 400);
    }
    const data = await cuentasService.escalateIncident(id, req.user.id, motivo);
    return success(res, data, data.mensaje);
}

async function resolverIncidencia(req, res) {
    const id = enteroPositivo(req.params.id);
    const solucion = texto(req.body?.solucion, 10000, { required: true });
    if (!id || !solucion) return error(res, 'Indica una solución válida', 400);
    const data = await cuentasService.resolveIncident(id, req.user.id, solucion);
    return success(res, data, data.mensaje);
}

async function subirEvidencia(req, res) {
    if (!req.file) return error(res, 'Selecciona un archivo para adjuntar', 400);
    const id = enteroPositivo(req.params.id);
    const type = texto(req.body?.tipo, 40, { required: true });
    if (!id || !['SOPORTE_ANDAHUAYLAS', 'SOPORTE_ABANCAY'].includes(type)) {
        await removeUploadedFile(req);
        return error(res, 'El tipo de evidencia debe ser SOPORTE_ANDAHUAYLAS o SOPORTE_ABANCAY', 400);
    }
    if (!STAFF_ROLES.has(String(req.user.rol || '').toLowerCase())) {
        await removeUploadedFile(req);
        return error(res, 'Solo el personal de soporte puede registrar evidencias técnicas', 403);
    }
    const data = await cuentasService.addEvidence({ id, userId: req.user.id, type, file: req.file });
    return success(res, data, 'Evidencia guardada correctamente', 201);
}

async function obtenerEstadisticas(req, res) {
    const data = await cuentasService.getStats();
    return success(res, data);
}

module.exports = {
    listarPlataformas,
    listarFacultades,
    crearPlataforma,
    crearIncidencia: asyncHandler(crearIncidencia, { cleanupUploadedFile: true }),
    listarIncidencias,
    obtenerIncidencia,
    escalarIncidencia,
    resolverIncidencia,
    subirEvidencia: asyncHandler(subirEvidencia, { cleanupUploadedFile: true }),
    obtenerEstadisticas,
    rechazarCredenciales,
    uploadDirectory
};
