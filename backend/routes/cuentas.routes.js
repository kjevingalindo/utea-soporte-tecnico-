const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const verificarToken = require('../middleware/authMiddleware');
const { verificarRol } = require('../middleware/roleMiddleware');
const controller = require('../controllers/cuentas.controller');
const requireIdempotencyKey = require('../middleware/idempotencyKey');
const { ACCOUNT_STAFF_ROLES } = require('../utils/accessControl');

const router = express.Router();
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const allowedTypes = new Map([
    ['image/jpeg', '.jpg'],
    ['image/png', '.png'],
    ['image/webp', '.webp'],
    ['application/pdf', '.pdf']
]);
const staffRoles = [...ACCOUNT_STAFF_ROLES];

fs.mkdirSync(controller.uploadDirectory, { recursive: true });

const upload = multer({
    storage: multer.diskStorage({
        destination: controller.uploadDirectory,
        filename: (req, file, callback) => {
            callback(null, `${crypto.randomUUID()}${allowedTypes.get(file.mimetype) || ''}`);
        }
    }),
    limits: { fileSize: MAX_FILE_SIZE, files: 1 },
    fileFilter: (req, file, callback) => {
        if (!allowedTypes.has(file.mimetype)) {
            return callback(new Error('Solo se permiten imágenes JPG, PNG, WEBP y documentos PDF'));
        }
        return callback(null, true);
    }
});

function handleUpload(req, res, next) {
    upload.single('archivo')(req, res, error => {
        if (!error) return next();
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: 'El archivo supera el límite de 10 MB' });
        }
        return res.status(400).json({ error: error.message || 'No se pudo cargar el archivo' });
    });
}

async function validateFileSignature(req, res, next) {
    if (!req.file) return next();
    let handle;
    try {
        handle = await fs.promises.open(req.file.path, 'r');
        const header = Buffer.alloc(12);
        const { bytesRead } = await handle.read(header, 0, header.length, 0);
        await handle.close();
        handle = null;
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

        if (valid) return next();
        await fs.promises.unlink(req.file.path);
        return res.status(400).json({ error: 'El contenido del archivo no coincide con el tipo permitido' });
    } catch (error) {
        if (handle) await handle.close();
        await fs.promises.unlink(req.file.path).catch(cleanupError => {
            if (cleanupError.code !== 'ENOENT') {
                console.error('No se pudo eliminar una evidencia inválida:', cleanupError.message);
            }
        });
        console.error('No se pudo validar una evidencia de cuentas:', error.message);
        return res.status(400).json({ error: 'No se pudo validar el archivo adjunto' });
    }
}

router.get('/plataformas', controller.listarPlataformas);
router.get('/facultades', controller.listarFacultades);

router.use(verificarToken);

router.post('/plataformas', verificarRol('admin', 'superadmin'), controller.rechazarCredenciales, controller.crearPlataforma);

router.get('/stats', verificarRol(...staffRoles), controller.obtenerEstadisticas);
router.post('/incidencias', requireIdempotencyKey, handleUpload, validateFileSignature, controller.crearIncidencia);
router.get('/incidencias', controller.listarIncidencias);
router.get('/incidencias/:id', controller.obtenerIncidencia);
router.post('/incidencias/:id/escalar', verificarRol(...staffRoles), controller.rechazarCredenciales, controller.escalarIncidencia);
router.post('/incidencias/:id/solucion', verificarRol(...staffRoles), controller.rechazarCredenciales, controller.resolverIncidencia);
router.post(
    '/incidencias/:id/evidencias',
    handleUpload,
    validateFileSignature,
    controller.rechazarCredenciales,
    controller.subirEvidencia
);
router.get('/incidencias/:id/evidencias/:evidenceId/descargar', controller.descargarEvidencia);

module.exports = router;
