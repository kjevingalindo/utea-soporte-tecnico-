const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const router = express.Router();
const db = require('../db');
const verificarToken = require('../middleware/authMiddleware');
const { registrarHistorial } = require('./historial');
const requireTicketAccess = require('../middleware/ticketAccess');
const { TICKET_ATTACHMENT_ROLES } = require('../utils/accessControl');

const uploadDirectory = path.resolve(__dirname, '../uploads/tickets');
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const allowedTypes = new Map([
    ['image/jpeg', '.jpg'],
    ['image/png', '.png'],
    ['image/webp', '.webp'],
    ['application/pdf', '.pdf']
]);

fs.mkdirSync(uploadDirectory, { recursive: true });

const storage = multer.diskStorage({
    destination: uploadDirectory,
    filename: (req, file, callback) => {
        callback(null, `${crypto.randomUUID()}${allowedTypes.get(file.mimetype) || ''}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE, files: 1 },
    fileFilter: (req, file, callback) => {
        if (!allowedTypes.has(file.mimetype)) {
            return callback(new Error('Solo se permiten imágenes JPG, PNG, WEBP y documentos PDF'));
        }
        callback(null, true);
    }
});

function handleUpload(req, res, next) {
    upload.single('archivo')(req, res, (err) => {
        if (!err) return next();
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: 'El archivo supera el límite de 10 MB' });
        }
        return res.status(400).json({ error: err.message || 'No se pudo cargar el archivo' });
    });
}

async function validateFileSignature(req, res, next) {
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
        return res.status(400).json({ error: 'El contenido del archivo no coincide con el tipo permitido' });
    } catch (err) {
        if (handle) await handle.close().catch(() => {});
        await fs.promises.unlink(req.file.path).catch(() => {});
        return res.status(400).json({ error: 'No se pudo validar el archivo adjunto' });
    }
}

router.get('/:ticketId', verificarToken, requireTicketAccess({ roles: TICKET_ATTACHMENT_ROLES }), (req, res) => {
    db.query(
        `SELECT id, ticket_id, usuario_id, nombre_original, tipo_mime, tamano_bytes, created_at
         FROM ticket_adjuntos WHERE ticket_id = ? ORDER BY created_at DESC`,
        [req.params.ticketId],
        (err, rows) => {
            if (err) return res.status(500).json({ error: 'No se pudieron cargar las evidencias' });
            res.json(rows);
        }
    );
});

router.post('/:ticketId', verificarToken, requireTicketAccess({ roles: TICKET_ATTACHMENT_ROLES }), handleUpload, validateFileSignature, (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Selecciona un archivo para adjuntar' });

    db.query(
        `INSERT INTO ticket_adjuntos
            (ticket_id, usuario_id, nombre_original, nombre_archivo, tipo_mime, tamano_bytes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
            req.params.ticketId,
            req.user.id,
            path.basename(req.file.originalname).slice(0, 255),
            req.file.filename,
            req.file.mimetype,
            req.file.size
        ],
        (err, result) => {
            if (err) {
                fs.unlink(req.file.path, () => {});
                return res.status(500).json({ error: 'No se pudo guardar la evidencia' });
            }
            registrarHistorial(
                req.params.ticketId,
                req.user.id,
                'evidencia',
                `${req.user.username} adjuntó una evidencia: ${path.basename(req.file.originalname).slice(0, 255)}`,
                'adjunto',
                null,
                result.insertId
            );
            res.status(201).json({ mensaje: 'Evidencia adjuntada correctamente', id: result.insertId });
        }
    );
});

router.get('/:ticketId/:adjuntoId/descargar', verificarToken, requireTicketAccess({ roles: TICKET_ATTACHMENT_ROLES }), (req, res) => {
    db.query(
        `SELECT nombre_original, nombre_archivo, tipo_mime
         FROM ticket_adjuntos WHERE id = ? AND ticket_id = ?`,
        [req.params.adjuntoId, req.params.ticketId],
        (err, rows) => {
            if (err) return res.status(500).json({ error: 'No se pudo localizar la evidencia' });
            if (!rows.length) return res.status(404).json({ error: 'Evidencia no encontrada' });

            const filePath = path.join(uploadDirectory, path.basename(rows[0].nombre_archivo));
            if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'El archivo ya no está disponible' });
            res.download(filePath, rows[0].nombre_original);
        }
    );
});

module.exports = router;