const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const router = express.Router();
const verificarToken = require('../middleware/authMiddleware');
const { verificarRol } = require('../middleware/roleMiddleware');
const apoyosService = require('../services/apoyosService');
const { detectarConflictos } = require('../services/apoyosConflictService');
const { obtenerEstadisticasApoyos } = require('../services/apoyosStatsService');
const { procesarRecordatorios } = require('../services/apoyosRemindersService');

const uploadRoot = process.env.UTEA_UPLOAD_ROOT
    ? path.resolve(process.env.UTEA_UPLOAD_ROOT)
    : path.resolve(__dirname, '../uploads');
const autorizacionesDir = path.join(uploadRoot, 'autorizaciones');
const evidenciasDir = path.join(uploadRoot, 'apoyos_evidencias');

fs.mkdirSync(autorizacionesDir, { recursive: true });
fs.mkdirSync(evidenciasDir, { recursive: true });

const allowedTypes = new Map([
    ['image/jpeg', '.jpg'],
    ['image/png', '.png'],
    ['image/webp', '.webp'],
    ['application/pdf', '.pdf']
]);

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dest = req.path.includes('/finalizar') ? evidenciasDir : autorizacionesDir;
        cb(null, dest);
    },
    filename: (req, file, cb) => {
        const ext = allowedTypes.get(file.mimetype) || path.extname(file.originalname).toLowerCase();
        cb(null, `${crypto.randomUUID()}${ext}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (!allowedTypes.has(file.mimetype)) {
            return cb(new Error('Solo se permiten archivos en formato PDF, JPG, PNG o WEBP'));
        }
        cb(null, true);
    }
});

function handleUpload(fieldName = 'archivo') {
    return (req, res, next) => {
        upload.single(fieldName)(req, res, (err) => {
            if (!err) return next();
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ error: 'El archivo supera el límite de 10 MB' });
            }
            return res.status(400).json({ error: err.message || 'Error al procesar el archivo adjunto' });
        });
    };
}

async function validateSignature(req, res, next) {
    if (!req.file) return next();
    let handle;
    try {
        handle = await fs.promises.open(req.file.path, 'r');
        const header = Buffer.alloc(12);
        const { bytesRead } = await handle.read(header, 0, header.length, 0);
        const signature = header.subarray(0, bytesRead);
        const valid = req.file.mimetype === 'image/jpeg'
            ? signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff
            : req.file.mimetype === 'image/png'
                ? signature.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
                : req.file.mimetype === 'image/webp'
                    ? signature.toString('ascii', 0, 4) === 'RIFF' && signature.toString('ascii', 8, 12) === 'WEBP'
                    : req.file.mimetype === 'application/pdf'
                        ? signature.toString('ascii', 0, 5) === '%PDF-'
                        : false;

        await handle.close();
        if (valid) return next();

        await fs.promises.unlink(req.file.path);
        return res.status(400).json({ error: 'El contenido del archivo no coincide con un formato válido de documento o imagen' });
    } catch (err) {
        if (handle) await handle.close().catch(() => {});
        if (req.file?.path) await fs.promises.unlink(req.file.path).catch(() => {});
        return res.status(400).json({ error: 'Error al verificar la firma de archivo' });
    }
}

// 1. Estadísticas de apoyos (separadas de tickets)
router.get('/estadisticas', verificarToken, async (req, res) => {
    try {
        const stats = await obtenerEstadisticasApoyos(req.query);
        res.json(stats);
    } catch (err) {
        console.error('Error obteniendo estadísticas de apoyos:', err);
        res.status(500).json({ error: 'Error al calcular las estadísticas de apoyos' });
    }
});

// 2. Comprobar cruces de horario antes de confirmar
router.get('/conflictos', verificarToken, async (req, res) => {
    try {
        const { apoyo_id, fecha_evento, hora_preparacion, hora_fin, bloque, ambiente, tecnico_id } = req.query;
        if (!fecha_evento || !hora_preparacion || !hora_fin || !bloque || !ambiente) {
            return res.status(400).json({ error: 'Faltan parámetros de fecha, horario o ambiente para verificar conflictos' });
        }
        const result = await detectarConflictos({
            apoyoId: apoyo_id ? Number(apoyo_id) : null,
            fecha_evento,
            hora_preparacion,
            hora_fin,
            bloque,
            ambiente,
            tecnico_id: tecnico_id ? Number(tecnico_id) : null
        });
        res.json(result);
    } catch (err) {
        console.error('Error detectando conflictos:', err);
        res.status(500).json({ error: 'Error al comprobar conflictos de horario' });
    }
});

// 3. Crear solicitud de apoyo
router.post('/', verificarToken, handleUpload('archivo'), validateSignature, async (req, res) => {
    try {
        const result = await apoyosService.crearSolicitud(req.user, req.body, req.file);
        if (result.error) {
            return res.status(result.status || 400).json({ error: result.error });
        }
        res.status(201).json(result);
    } catch (err) {
        console.error('Error creando solicitud de apoyo:', err);
        if (req.file?.path && fs.existsSync(req.file.path)) {
            try { fs.unlinkSync(req.file.path); } catch (_) {}
        }
        res.status(500).json({ error: 'No se pudo registrar la solicitud de apoyo' });
    }
});

// 4. Listar solicitudes (filtradas por rol y query)
router.get('/', verificarToken, async (req, res) => {
    try {
        const rows = await apoyosService.listarSolicitudes(req.user, req.query);
        res.json(rows);
    } catch (err) {
        console.error('Error listando solicitudes de apoyo:', err);
        res.status(500).json({ error: 'No se pudieron consultar las solicitudes de apoyo' });
    }
});

// 5. Procesar recordatorios persistentes (reloj actual o simulado)
router.post('/recordatorios/procesar', verificarToken, async (req, res) => {
    try {
        const { ahora } = req.body || {};
        const result = await procesarRecordatorios(ahora || null);
        res.json(result);
    } catch (err) {
        console.error('Error procesando recordatorios:', err);
        res.status(500).json({ error: 'Error procesando recordatorios de apoyo' });
    }
});

// 6. Obtener detalle de solicitud por ID
router.get('/:id', verificarToken, async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (!id || id < 1) return res.status(400).json({ error: 'ID de solicitud no válido' });
        const solicitud = await apoyosService.obtenerSolicitudPorId(id, req.user);
        if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });
        res.json(solicitud);
    } catch (err) {
        if (err.statusCode === 403) {
            return res.status(403).json({ error: err.message });
        }
        console.error('Error obteniendo detalle de solicitud:', err);
        res.status(500).json({ error: 'No se pudo obtener el detalle de la solicitud' });
    }
});

// 7. Descargar documento de autorización con control de acceso
router.get('/:id/autorizacion', verificarToken, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const solicitud = await apoyosService.obtenerSolicitudPorId(id, req.user);
        if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada' });

        const filePath = path.join(autorizacionesDir, path.basename(solicitud.archivo_autorizacion));
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'El archivo de autorización no se encuentra en el servidor' });
        }

        res.download(filePath, solicitud.archivo_autorizacion_nombre || 'autorizacion.pdf');
    } catch (err) {
        if (err.statusCode === 403) {
            return res.status(403).json({ error: err.message });
        }
        console.error('Error descargando autorización:', err);
        res.status(500).json({ error: 'Error al descargar la autorización' });
    }
});

// 8. Observar solicitud (Admin)
router.post('/:id/observar', verificarToken, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { motivo } = req.body || {};
        const result = await apoyosService.observarSolicitud(id, req.user, motivo);
        if (result.error) return res.status(result.status || 400).json({ error: result.error });
        res.json(result);
    } catch (err) {
        console.error('Error observando solicitud:', err);
        res.status(500).json({ error: 'Error al observar la solicitud' });
    }
});

// 9. Subsanar solicitud (Solicitante)
router.post('/:id/subsanar', verificarToken, handleUpload('archivo'), validateSignature, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { subsanacion } = req.body || {};
        const result = await apoyosService.subsanarSolicitud(id, req.user, subsanacion, req.file);
        if (result.error) {
            if (req.file?.path && fs.existsSync(req.file.path)) {
                try { fs.unlinkSync(req.file.path); } catch (_) {}
            }
            return res.status(result.status || 400).json({ error: result.error });
        }
        res.json(result);
    } catch (err) {
        console.error('Error subsanando solicitud:', err);
        if (req.file?.path && fs.existsSync(req.file.path)) {
            try { fs.unlinkSync(req.file.path); } catch (_) {}
        }
        res.status(500).json({ error: 'Error al subsanar la solicitud' });
    }
});

// 10. Aprobar solicitud (Admin)
router.post('/:id/aprobar', verificarToken, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const result = await apoyosService.aprobarSolicitud(id, req.user);
        if (result.error) return res.status(result.status || 400).json(result);
        res.json(result);
    } catch (err) {
        console.error('Error aprobando solicitud:', err);
        res.status(500).json({ error: 'Error al aprobar la solicitud' });
    }
});

// 11. Rechazar solicitud (Admin)
router.post('/:id/rechazar', verificarToken, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { motivo } = req.body || {};
        const result = await apoyosService.rechazarSolicitud(id, req.user, motivo);
        if (result.error) return res.status(result.status || 400).json({ error: result.error });
        res.json(result);
    } catch (err) {
        console.error('Error rechazando solicitud:', err);
        res.status(500).json({ error: 'Error al rechazar la solicitud' });
    }
});

// 12. Programar o reprogramar apoyo (Admin)
router.post('/:id/programar', verificarToken, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const result = await apoyosService.programarSolicitud(id, req.user, req.body || {});
        if (result.error) return res.status(result.status || 400).json(result);
        res.json(result);
    } catch (err) {
        console.error('Error programando solicitud:', err);
        res.status(500).json({ error: 'Error al programar el apoyo técnico' });
    }
});

// 13. Cancelar solicitud (Admin o Solicitante)
router.post('/:id/cancelar', verificarToken, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { motivo } = req.body || {};
        const result = await apoyosService.cancelarSolicitud(id, req.user, motivo);
        if (result.error) return res.status(result.status || 400).json({ error: result.error });
        res.json(result);
    } catch (err) {
        console.error('Error cancelando solicitud:', err);
        res.status(500).json({ error: 'Error al cancelar la solicitud' });
    }
});

// 14. Técnico: Confirmar recepción
router.post('/:id/confirmar-recepcion', verificarToken, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const result = await apoyosService.confirmarRecepcion(id, req.user);
        if (result.error) return res.status(result.status || 400).json({ error: result.error });
        res.json(result);
    } catch (err) {
        console.error('Error confirmando recepción:', err);
        res.status(500).json({ error: 'Error al confirmar la recepción' });
    }
});

// 15. Técnico: Registrar llegada e inicio
router.post('/:id/registrar-llegada', verificarToken, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const result = await apoyosService.registrarLlegada(id, req.user);
        if (result.error) return res.status(result.status || 400).json({ error: result.error });
        res.json(result);
    } catch (err) {
        console.error('Error registrando llegada:', err);
        res.status(500).json({ error: 'Error al registrar la llegada e inicio' });
    }
});

// 16. Técnico: Finalizar apoyo
router.post('/:id/finalizar', verificarToken, handleUpload('archivo_evidencia'), validateSignature, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const result = await apoyosService.finalizarApoyo(id, req.user, req.body || {}, req.file);
        if (result.error) {
            if (req.file?.path && fs.existsSync(req.file.path)) {
                try { fs.unlinkSync(req.file.path); } catch (_) {}
            }
            return res.status(result.status || 400).json({ error: result.error });
        }
        res.json(result);
    } catch (err) {
        console.error('Error finalizando apoyo:', err);
        if (req.file?.path && fs.existsSync(req.file.path)) {
            try { fs.unlinkSync(req.file.path); } catch (_) {}
        }
        res.status(500).json({ error: 'Error al finalizar el apoyo' });
    }
});

// 17. Técnico: Informar impedimento
router.post('/:id/informar-impedimento', verificarToken, async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { motivo } = req.body || {};
        const result = await apoyosService.informarImpedimento(id, req.user, motivo);
        if (result.error) return res.status(result.status || 400).json({ error: result.error });
        res.json(result);
    } catch (err) {
        console.error('Error informando impedimento:', err);
        res.status(500).json({ error: 'Error al informar impedimento' });
    }
});

module.exports = router;

