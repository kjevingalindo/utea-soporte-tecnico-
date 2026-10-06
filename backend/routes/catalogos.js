const express = require('express');
const router = express.Router();
const db = require('../db');
const verificarToken = require('../middleware/authMiddleware');
const { verificarRol } = require('../middleware/roleMiddleware');

const esAdmin = verificarRol('admin', 'superadmin');

function idValido(value) {
    return /^\d+$/.test(String(value)) && Number(value) > 0;
}

function responderErrorDb(res, err) {
    if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Ya existe un registro con ese codigo' });
    }
    console.error('Error de catalogo:', err.message);
    return res.status(500).json({ error: 'No se pudo completar la operacion' });
}

function responderActualizacion(res, tabla, id, result, nombre) {
    if (result.affectedRows) return res.json({ mensaje: `${nombre} actualizado` });
    db.query(`SELECT id FROM ${tabla} WHERE id = ?`, [id], (err, rows) => {
        if (err) return responderErrorDb(res, err);
        if (!rows.length) return res.status(404).json({ error: `${nombre} no encontrado` });
        res.json({ mensaje: `${nombre} actualizado` });
    });
}

router.get('/oficinas', verificarToken, (req, res) => {
    const esAdminRol = ['admin', 'superadmin'].includes(req.user.rol);
    const filtro = esAdminRol ? '' : 'WHERE activo = TRUE';
    
    db.query(`SELECT id, codigo, nombre, descripcion, activo FROM oficinas ${filtro} ORDER BY nombre`, (err, rows) => {
        if (err) return responderErrorDb(res, err);

        if (rows.length === 0) {
            // Siembra automática de oficinas oficiales UTEA Andahuaylas si la tabla está vacía
            const oficinasOficiales = [
                ['SAC', 'Servicios Académicos', 'Matrículas, actas, certificados y registros académicos'],
                ['ADMIS', 'Admisión', 'Procesos de admisión, postulantes e inscripción institucional'],
                ['GYT', 'Grados y Títulos', 'Tramitación de grados de bachiller, títulos profesionales y expedientes'],
                ['MDP', 'Mesa de Partes', 'Recepción de solicitudes, sistema de trámite documentario y licencias'],
                ['ADM', 'Administración', 'Gestión administrativa, contable, logística y servicios generales'],
                ['SUB-DER', 'Sub Dirección de Derecho', 'Dirección académica y coordinaciones de la carrera de Derecho'],
                ['SUB-ING', 'Sub Dirección de Agronomía, Ing. Ambiental e Ing. Civil', 'Dirección académica y coordinaciones de las facultades de Ingeniería y Agronomía'],
                ['SUB-CED', 'Sub Dirección de Contabilidad y Educación', 'Dirección académica y coordinaciones de las facultades de Contabilidad y Educación'],
                ['SUB-ENF', 'Sub Dirección de Enfermería', 'Dirección académica, coordinaciones y gabinete de la carrera de Enfermería'],
                ['AUL', 'Aulas de Clase', 'Proyectores multimedia, ecran, audio y redes en aulas de enseñanza'],
                ['LAB', 'Laboratorios', 'Laboratorios de cómputo, informática, licencias de software y equipos de simulación']
            ];

            const sqlInsert = 'INSERT IGNORE INTO oficinas (codigo, nombre, descripcion) VALUES ?';
            db.query(sqlInsert, [oficinasOficiales], (errSeed) => {
                if (errSeed) console.error('Error al sembrar oficinas oficiales:', errSeed.message);
                db.query(`SELECT id, codigo, nombre, descripcion, activo FROM oficinas ${filtro} ORDER BY nombre`, (err2, rows2) => {
                    if (err2) return responderErrorDb(res, err2);
                    res.json(rows2);
                });
            });
            return;
        }

        res.json(rows);
    });
});

router.post('/oficinas', verificarToken, esAdmin, (req, res) => {
    const { codigo, nombre, descripcion = null } = req.body || {};
    const codigoNormalizado = typeof codigo === 'string' ? codigo.trim().toUpperCase() : '';
    const nombreNormalizado = typeof nombre === 'string' ? nombre.trim() : '';

    if (!/^[A-Z0-9][A-Z0-9_-]{1,19}$/.test(codigoNormalizado) || !nombreNormalizado || nombreNormalizado.length > 150) {
        return res.status(400).json({ error: 'Codigo o nombre de oficina no valido' });
    }
    if (descripcion !== null && (typeof descripcion !== 'string' || descripcion.length > 500)) {
        return res.status(400).json({ error: 'Descripcion no valida' });
    }

    db.query('INSERT INTO oficinas (codigo, nombre, descripcion) VALUES (?, ?, ?)',
        [codigoNormalizado, nombreNormalizado, descripcion], (err, result) => {
            if (err) return responderErrorDb(res, err);
            res.status(201).json({ id: result.insertId, codigo: codigoNormalizado, nombre: nombreNormalizado });
        });
});

router.patch('/oficinas/:id', verificarToken, esAdmin, (req, res) => {
    if (!idValido(req.params.id)) return res.status(400).json({ error: 'Id de oficina no valido' });

    const { nombre, descripcion, activo } = req.body || {};
    const cambios = [];
    const valores = [];

    if (nombre !== undefined) {
        if (typeof nombre !== 'string' || !nombre.trim() || nombre.trim().length > 150) {
            return res.status(400).json({ error: 'Nombre no valido' });
        }
        cambios.push('nombre = ?');
        valores.push(nombre.trim());
    }
    if (descripcion !== undefined) {
        if (descripcion !== null && (typeof descripcion !== 'string' || descripcion.length > 500)) {
            return res.status(400).json({ error: 'Descripcion no valida' });
        }
        cambios.push('descripcion = ?');
        valores.push(descripcion);
    }
    if (activo !== undefined) {
        if (typeof activo !== 'boolean') return res.status(400).json({ error: 'Activo debe ser booleano' });
        cambios.push('activo = ?');
        valores.push(activo);
    }
    if (!cambios.length) return res.status(400).json({ error: 'No hay cambios para guardar' });

    valores.push(req.params.id);
    db.query(`UPDATE oficinas SET ${cambios.join(', ')} WHERE id = ?`, valores, (err, result) => {
        if (err) return responderErrorDb(res, err);
        responderActualizacion(res, 'oficinas', req.params.id, result, 'Oficina');
    });
});

router.get('/categorias', verificarToken, (req, res) => {
    const oficinaId = req.query.oficina_id;
    if (!idValido(oficinaId)) return res.status(400).json({ error: 'oficina_id es obligatorio y debe ser valido' });

    const filtroActivo = req.user.rol === 'admin' ? '' :
        'AND c.activo = TRUE AND (c.categoria_padre_id IS NULL OR EXISTS (SELECT 1 FROM categorias p WHERE p.id = c.categoria_padre_id AND p.activo = TRUE))';
    db.query(`SELECT c.id, c.oficina_id, c.categoria_padre_id, c.codigo, c.nombre, c.descripcion, c.activo
              FROM categorias c
              WHERE c.oficina_id = ? ${filtroActivo}
              ORDER BY c.categoria_padre_id IS NOT NULL, c.nombre`, [oficinaId], (err, rows) => {
        if (err) return responderErrorDb(res, err);
        res.json(rows);
    });
});

router.post('/categorias', verificarToken, esAdmin, (req, res) => {
    const { oficina_id, categoria_padre_id = null, codigo, nombre, descripcion = null } = req.body || {};
    const codigoNormalizado = typeof codigo === 'string' ? codigo.trim().toUpperCase() : '';
    const nombreNormalizado = typeof nombre === 'string' ? nombre.trim() : '';
    const parentId = categoria_padre_id === null || categoria_padre_id === '' ? null : categoria_padre_id;

    if (!idValido(oficina_id) || (parentId !== null && !idValido(parentId)) ||
        !/^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(codigoNormalizado) || !nombreNormalizado || nombreNormalizado.length > 150) {
        return res.status(400).json({ error: 'Oficina, categoria padre, codigo o nombre no valido' });
    }
    if (descripcion !== null && (typeof descripcion !== 'string' || descripcion.length > 500)) {
        return res.status(400).json({ error: 'Descripcion no valida' });
    }

    db.query('SELECT id FROM oficinas WHERE id = ? AND activo = TRUE', [oficina_id], (officeErr, offices) => {
        if (officeErr) return responderErrorDb(res, officeErr);
        if (!offices.length) return res.status(400).json({ error: 'La oficina no existe o esta inactiva' });

        const crear = () => db.query(
            'INSERT INTO categorias (oficina_id, categoria_padre_id, codigo, nombre, descripcion) VALUES (?, ?, ?, ?, ?)',
            [oficina_id, parentId, codigoNormalizado, nombreNormalizado, descripcion], (err, result) => {
                if (err) return responderErrorDb(res, err);
                res.status(201).json({
                    id: result.insertId,
                    oficina_id: Number(oficina_id),
                    categoria_padre_id: parentId === null ? null : Number(parentId),
                    codigo: codigoNormalizado,
                    nombre: nombreNormalizado
                });
            }
        );

        if (parentId === null) return crear();
        db.query('SELECT id FROM categorias WHERE id = ? AND oficina_id = ? AND categoria_padre_id IS NULL AND activo = TRUE',
            [parentId, oficina_id], (parentErr, parents) => {
                if (parentErr) return responderErrorDb(res, parentErr);
                if (!parents.length) return res.status(400).json({ error: 'La categoria padre no pertenece a la oficina' });
                crear();
            });
    });
});

router.patch('/categorias/:id', verificarToken, esAdmin, (req, res) => {
    if (!idValido(req.params.id)) return res.status(400).json({ error: 'Id de categoria no valido' });

    const { nombre, descripcion, activo } = req.body || {};
    const cambios = [];
    const valores = [];
    if (nombre !== undefined) {
        if (typeof nombre !== 'string' || !nombre.trim() || nombre.trim().length > 150) {
            return res.status(400).json({ error: 'Nombre no valido' });
        }
        cambios.push('nombre = ?');
        valores.push(nombre.trim());
    }
    if (descripcion !== undefined) {
        if (descripcion !== null && (typeof descripcion !== 'string' || descripcion.length > 500)) {
            return res.status(400).json({ error: 'Descripcion no valida' });
        }
        cambios.push('descripcion = ?');
        valores.push(descripcion);
    }
    if (activo !== undefined) {
        if (typeof activo !== 'boolean') return res.status(400).json({ error: 'Activo debe ser booleano' });
        cambios.push('activo = ?');
        valores.push(activo);
    }
    if (!cambios.length) return res.status(400).json({ error: 'No hay cambios para guardar' });

    valores.push(req.params.id);
    db.query(`UPDATE categorias SET ${cambios.join(', ')} WHERE id = ?`, valores, (err, result) => {
        if (err) return responderErrorDb(res, err);
        responderActualizacion(res, 'categorias', req.params.id, result, 'Categoria');
    });
});

router.get('/oficinas/:oficinaId/tecnicos', verificarToken, esAdmin, (req, res) => {
    if (!idValido(req.params.oficinaId)) return res.status(400).json({ error: 'Id de oficina no valido' });
    db.query(`SELECT t.id, t.nombre, ot.es_responsable
              FROM tecnico_oficinas ot
              INNER JOIN tecnicos t ON t.id = ot.tecnico_id
              WHERE ot.oficina_id = ? ORDER BY ot.es_responsable DESC, t.nombre`,
        [req.params.oficinaId], (err, rows) => {
            if (err) return responderErrorDb(res, err);
            res.json(rows);
        });
});

router.put('/oficinas/:oficinaId/tecnicos/:tecnicoId', verificarToken, esAdmin, (req, res) => {
    const { oficinaId, tecnicoId } = req.params;
    const { es_responsable = false } = req.body || {};
    if (!idValido(oficinaId) || !idValido(tecnicoId) || typeof es_responsable !== 'boolean') {
        return res.status(400).json({ error: 'Oficina, tecnico o indicador de responsable no valido' });
    }

    db.query(`INSERT INTO tecnico_oficinas (tecnico_id, oficina_id, es_responsable)
              VALUES (?, ?, ?)
              ON DUPLICATE KEY UPDATE es_responsable = VALUES(es_responsable)`,
        [tecnicoId, oficinaId, es_responsable], (err) => {
            if (err) return responderErrorDb(res, err);
            res.json({ mensaje: 'Tecnico asociado a la oficina' });
        });
});

router.delete('/oficinas/:oficinaId/tecnicos/:tecnicoId', verificarToken, esAdmin, (req, res) => {
    const { oficinaId, tecnicoId } = req.params;
    if (!idValido(oficinaId) || !idValido(tecnicoId)) {
        return res.status(400).json({ error: 'Oficina o tecnico no valido' });
    }
    db.query('DELETE FROM tecnico_oficinas WHERE oficina_id = ? AND tecnico_id = ?',
        [oficinaId, tecnicoId], (err, result) => {
            if (err) return responderErrorDb(res, err);
            if (!result.affectedRows) return res.status(404).json({ error: 'Asignacion no encontrada' });
            res.json({ mensaje: 'Tecnico desvinculado de la oficina' });
        });
});

module.exports = router;