const express = require('express');
const router = express.Router();
const db = require('../db');
const verificarToken = require('../middleware/authMiddleware');
const { verificarRol } = require('../middleware/roleMiddleware');
const { crearNotificacion } = require('./notifications');
const { registrarHistorial } = require('./historial');
const { calculateSlaDeadlines } = require('../utils/sla');
const { UTEA_PREGRADO_CARRERAS } = require('../utils/uteaConfig');

const ESTADOS_VALIDOS = ['Creado', 'Clasificado', 'Asignado', 'En proceso', 'Esperando usuario', 'Solucionado', 'Cerrado'];
const PRIORIDADES_VALIDAS = ['Baja', 'Media', 'Alta', 'Urgente', 'Critica'];
const AMBIENTES_POR_BLOQUE = {
    'Bloque A': [
        'Salones / Aulas',
        'Laboratorio de Agronomía y Ambiental',
        'Auditorio',
        'Centro de Cómputo'
    ],
    'Bloque B': [
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
    ],
    'Bloque C': [
        'Sala de Docentes',
        'Salones / Aulas',
        'Biblioteca',
        'Laboratorio de Ingeniería Civil'
    ]
};

function esFechaProgramadaValida(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
        return Number.isFinite(parsed.getTime()) &&
            parsed.toISOString().slice(0, 10) === value &&
            parsed.getUTCDay() !== 0 && parsed.getUTCDay() !== 6;
}

function fechaActualEnPeru() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Lima',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());
}

function normalizarEstado(estado) {
    const valor = typeof estado === 'string' ? estado.trim() : '';
    if (ESTADOS_VALIDOS.includes(valor)) return valor;
    return 'Creado';
}

function calcularPrioridad(impacto, urgencia, prioridadActual) {
    const impactoValor = typeof impacto === 'string' ? impacto.trim() : '';
    const urgenciaValor = typeof urgencia === 'string' ? urgencia.trim() : '';
    if (impactoValor === 'Critico' || urgenciaValor === 'Critica') return 'Critica';
    if (impactoValor === 'Alto' || urgenciaValor === 'Alta') return 'Alta';
    if (impactoValor === 'Medio' || urgenciaValor === 'Media') return 'Media';
    if (PRIORIDADES_VALIDAS.includes(prioridadActual || '')) return prioridadActual;
    return 'Baja';
}

// Crear ticket (admin y usuario) - se asigna automáticamente al jefe
router.post('/', verificarToken, (req, res) => {
    const {
        titulo, descripcion, prioridad, tecnico_id, oficina_id, categoria_id, carrera, bloque, ambiente, ubicacion,
        solicitante_nombre, codigo_universitario_dni, tipo_solicitante, asignatura_area, aula,
        impacto, urgencia
    } = req.body || {};

    if (!titulo) {
        return res.status(400).json({ error: 'El titulo es obligatorio' });
    }

    if (typeof titulo !== 'string' || titulo.length > 255) {
        return res.status(400).json({ error: 'El titulo debe ser texto y maximo 255 caracteres' });
    }

    const prioridadFinal = calcularPrioridad(impacto, urgencia, prioridad);
    if (!PRIORIDADES_VALIDAS.includes(prioridadFinal)) {
        return res.status(400).json({ error: 'La prioridad no es valida' });
    }

    const tieneOficina = oficina_id !== undefined && oficina_id !== null && oficina_id !== '';
    const tieneCategoria = categoria_id !== undefined && categoria_id !== null && categoria_id !== '';
    if (tieneOficina !== tieneCategoria) {
        return res.status(400).json({ error: 'Debes indicar oficina y categoria juntas' });
    }
    if ((tieneOficina && (!Number.isInteger(Number(oficina_id)) || Number(oficina_id) < 1)) ||
        (tieneCategoria && (!Number.isInteger(Number(categoria_id)) || Number(categoria_id) < 1))) {
        return res.status(400).json({ error: 'Oficina o categoria no valida' });
    }
    if (ubicacion !== undefined && ubicacion !== null &&
        (typeof ubicacion !== 'string' || ubicacion.trim().length > 255)) {
        return res.status(400).json({ error: 'La ubicacion no puede superar 255 caracteres' });
    }
    if (solicitante_nombre !== undefined &&
        (typeof solicitante_nombre !== 'string' || !solicitante_nombre.trim() || solicitante_nombre.trim().length > 150)) {
        return res.status(400).json({ error: 'El nombre del solicitante no es valido' });
    }
    if (codigo_universitario_dni !== undefined &&
        (typeof codigo_universitario_dni !== 'string' || !codigo_universitario_dni.trim() || codigo_universitario_dni.trim().length > 40)) {
        return res.status(400).json({ error: 'El codigo universitario o DNI no es valido' });
    }
    if (tipo_solicitante !== undefined && !['estudiante', 'docente', 'administrativo'].includes(tipo_solicitante)) {
        return res.status(400).json({ error: 'El tipo de solicitante no es valido' });
    }
    if (asignatura_area !== undefined && asignatura_area !== null &&
        (typeof asignatura_area !== 'string' || asignatura_area.trim().length > 160)) {
        return res.status(400).json({ error: 'La asignatura o área no puede superar 160 caracteres' });
    }
    if (tipo_solicitante === 'docente' &&
        (typeof asignatura_area !== 'string' || !asignatura_area.trim())) {
        return res.status(400).json({ error: 'Debes indicar la asignatura o área del docente' });
    }
    const carreraNormalizada = typeof carrera === 'string' ? carrera.trim() : '';
    const tieneBloqueAmbiente = bloque !== undefined || ambiente !== undefined;
    let bloqueNormalizado = null;
    let ambienteNormalizado = null;
    if (tieneBloqueAmbiente) {
        if (typeof bloque !== 'string' || !Object.prototype.hasOwnProperty.call(AMBIENTES_POR_BLOQUE, bloque) ||
            typeof ambiente !== 'string' || !AMBIENTES_POR_BLOQUE[bloque].includes(ambiente)) {
            return res.status(400).json({ error: 'Selecciona un bloque y un ambiente válido para la sede' });
        }
        bloqueNormalizado = bloque;
        ambienteNormalizado = ambiente;
    }
    let aulaNormalizada = null;
    if (aula !== undefined && aula !== null && aula !== '') {
        if (!Number.isInteger(Number(aula)) || Number(aula) < 1 || Number(aula) > 9999 || ambienteNormalizado !== 'Salones / Aulas') {
            return res.status(400).json({ error: 'El número de aula no es válido para el ambiente seleccionado' });
        }
        aulaNormalizada = Number(aula);
    }
    if (ambienteNormalizado === 'Salones / Aulas' && aulaNormalizada === null) {
        return res.status(400).json({ error: 'Debes indicar el número de aula' });
    }
    if (!carreraNormalizada && !tieneBloqueAmbiente) {
        return res.status(400).json({ error: 'Debes indicar la carrera o el bloque y ambiente del ticket' });
    }
    const asignaturaAreaNormalizada = tipo_solicitante === 'docente' ? asignatura_area.trim() : null;
    if (carreraNormalizada && !UTEA_PREGRADO_CARRERAS.includes(carreraNormalizada)) {
        return res.status(400).json({ error: 'La carrera seleccionada no es válida para la UTEA' });
    }
    const rolPuedeAsignarTecnico = ['admin', 'superadmin', 'adminti'].includes(String(req.user.rol || '').toLowerCase());
    const tieneTecnicoSeleccionado = rolPuedeAsignarTecnico && tecnico_id !== undefined && tecnico_id !== null && tecnico_id !== '';
    if (tieneTecnicoSeleccionado && (!Number.isInteger(Number(tecnico_id)) || Number(tecnico_id) < 1)) {
        return res.status(400).json({ error: 'El técnico seleccionado no es válido' });
    }

    const insertarTicket = () => {
        const tecnicoSql = tieneTecnicoSeleccionado
            ? 'SELECT id FROM tecnicos WHERE id = ?'
            : tieneOficina
            ? `SELECT t.id FROM tecnico_oficinas ot
               INNER JOIN tecnicos t ON t.id = ot.tecnico_id
               WHERE ot.oficina_id = ?
               ORDER BY ot.es_responsable DESC, t.id
               LIMIT 1`
            : 'SELECT id FROM tecnicos WHERE es_jefe = TRUE LIMIT 1';
        const tecnicoParams = tieneTecnicoSeleccionado
            ? [Number(tecnico_id)]
            : tieneOficina ? [oficina_id] : [];
        db.query(tecnicoSql, tecnicoParams, (err, results) => {
        if (err) return res.status(500).json(err);
        if (tieneTecnicoSeleccionado && results.length === 0) {
            return res.status(400).json({ error: 'El técnico seleccionado no existe' });
        }
        
        const jefeId = results.length > 0 ? results[0].id : null;
        const estadoInicial = 'Creado';
        const slaDeadlines = calculateSlaDeadlines(Date.now(), prioridadFinal);
        const sql = `INSERT INTO tickets
            (titulo, descripcion, estado, prioridad, tecnico_id, user_id, oficina_id, categoria_id, carrera, bloque, ambiente, aula, asignatura_area,
             ubicacion, solicitante_nombre, codigo_universitario_dni, tipo_solicitante, impacto, urgencia,
             sla_response_due_at, sla_resolution_due_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) `;

        db.query(sql, [
            titulo.trim(), descripcion || null, estadoInicial, prioridadFinal, jefeId, req.user.id,
            tieneOficina ? Number(oficina_id) : null,
            tieneCategoria ? Number(categoria_id) : null,
            carreraNormalizada || null,
            bloqueNormalizado,
            ambienteNormalizado,
            aulaNormalizada,
            asignaturaAreaNormalizada,
            ubicacion ? ubicacion.trim() : null,
            solicitante_nombre ? solicitante_nombre.trim() : null,
            codigo_universitario_dni ? codigo_universitario_dni.trim() : null,
            tipo_solicitante || null,
            impacto || null,
            urgencia || null,
            slaDeadlines.responseDueAt,
            slaDeadlines.resolutionDueAt
        ], (err, result) => {
            if (err) return res.status(500).json(err);

            // Notificar a todos los administradores sobre el nuevo ticket
            const ticketId = result.insertId;
            registrarHistorial(
                ticketId,
                req.user.id,
                'creado',
                `Ticket creado por ${req.user.username}`,
                'estado',
                null,
                estadoInicial
            );

            db.query("SELECT id FROM usuarios WHERE rol = 'admin'", (err2, admins) => {
                if (!err2 && admins) {
                    admins.forEach(admin => {
                        if (admin.id !== req.user.id) {
                            crearNotificacion(
                                admin.id, 
                                'nuevo_ticket', 
                                `${req.user.username} creó un nuevo ticket: "${titulo}" (${prioridadFinal})`, 
                                ticketId
                            );
                        }
                    });
                }
            });

            const mensaje = tieneOficina
                ? (jefeId ? 'Ticket creado y asignado a un tecnico de la oficina' : 'Ticket creado; pendiente de asignacion en la oficina')
                : 'Ticket creado y asignado al jefe';
            res.status(201).json({ mensaje, ticketId });
        });
        });
    };

    if (!tieneOficina) return insertarTicket();
    db.query(`SELECT c.id
              FROM categorias c
              INNER JOIN oficinas o ON o.id = c.oficina_id
              WHERE c.id = ? AND c.oficina_id = ? AND c.activo = TRUE AND o.activo = TRUE`,
        [categoria_id, oficina_id], (err, rows) => {
            if (err) return res.status(500).json(err);
            if (!rows.length) return res.status(400).json({ error: 'La categoria no pertenece a la oficina o esta inactiva' });
            insertarTicket();
        });
});

// Obtener tickets (admin/superadmin ve todos, usuario ve solo los suyos, con soporte de paginación)
router.get('/', verificarToken, (req, res) => {
    const isPaginated = req.query.page !== undefined || req.query.paginated === 'true';
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 10));
    const offset = (page - 1) * limit;

    const { estado, prioridad, busqueda } = req.query;

    let baseSql = `FROM tickets 
                   LEFT JOIN tecnicos ON tickets.tecnico_id = tecnicos.id
                   LEFT JOIN usuarios ON tickets.user_id = usuarios.id
                   LEFT JOIN oficinas ON tickets.oficina_id = oficinas.id
                   LEFT JOIN categorias ON tickets.categoria_id = categorias.id`;
    
    let whereClauses = [];
    let params = [];
    
    const esAdminRol = ['admin', 'superadmin', 'tecnico'].includes(req.user.rol);
    if (!esAdminRol) {
        whereClauses.push('tickets.user_id = ?');
        params.push(req.user.id);
    }

    if (estado && estado !== 'todos') {
        if (estado === 'activos') {
            whereClauses.push("tickets.estado NOT IN ('Solucionado', 'Cerrado')");
        } else if (estado === 'finalizados') {
            whereClauses.push("tickets.estado IN ('Solucionado', 'Cerrado')");
        } else {
            whereClauses.push('tickets.estado = ?');
            params.push(estado);
        }
    }

    if (prioridad) {
        whereClauses.push('tickets.prioridad = ?');
        params.push(prioridad);
    }

    if (busqueda && typeof busqueda === 'string' && busqueda.trim()) {
        whereClauses.push('(tickets.titulo LIKE ? OR tickets.solicitante_nombre LIKE ? OR tickets.descripcion LIKE ? OR usuarios.username LIKE ?)');
        const searchPattern = `%${busqueda.trim()}%`;
        params.push(searchPattern, searchPattern, searchPattern, searchPattern);
    }

    const whereSql = whereClauses.length ? ' WHERE ' + whereClauses.join(' AND ') : '';

    if (!isPaginated) {
        const sql = `SELECT tickets.*, tecnicos.nombre AS tecnico, usuarios.username,
                            oficinas.nombre AS oficina_nombre, categorias.nombre AS categoria_nombre,
                            DATE_FORMAT(tickets.fecha_programada, '%Y-%m-%d') AS fecha_programada_iso
                     ${baseSql} ${whereSql}
                     ORDER BY tickets.id DESC`;
        db.query(sql, params, (err, results) => {
            if (err) return res.status(500).json(err);
            res.json(results);
        });
        return;
    }

    const countSql = `SELECT COUNT(*) as total ${baseSql} ${whereSql}`;
    db.query(countSql, params, (errCount, countResults) => {
        if (errCount) return res.status(500).json(errCount);
        const total = countResults[0].total;
        const totalPages = Math.ceil(total / limit) || 1;

        const dataSql = `SELECT tickets.*, tecnicos.nombre AS tecnico, usuarios.username,
                                oficinas.nombre AS oficina_nombre, categorias.nombre AS categoria_nombre,
                                DATE_FORMAT(tickets.fecha_programada, '%Y-%m-%d') AS fecha_programada_iso
                         ${baseSql} ${whereSql}
                         ORDER BY tickets.id DESC
                         LIMIT ? OFFSET ?`;
        
        db.query(dataSql, [...params, limit, offset], (errData, results) => {
            if (errData) return res.status(500).json(errData);
            res.json({
                data: results,
                total,
                page,
                limit,
                totalPages
            });
        });
    });
});

router.get('/:id/historial', verificarToken, (req, res) => {
    const { id } = req.params;

    db.query(`SELECT th.*, u.username
              FROM ticket_historial th
              LEFT JOIN usuarios u ON u.id = th.usuario_id
              WHERE th.ticket_id = ?
              ORDER BY th.created_at ASC`, [id], (err, results) => {
        if (err) return res.status(500).json(err);

        if (req.user.rol !== 'admin') {
            db.query('SELECT user_id FROM tickets WHERE id = ?', [id], (ticketErr, ticketRows) => {
                if (ticketErr) return res.status(500).json(ticketErr);
                if (!ticketRows.length || Number(ticketRows[0].user_id) !== Number(req.user.id)) {
                    return res.status(403).json({ error: 'No tienes permisos para ver este historial' });
                }
                return res.json(results);
            });
            return;
        }

        res.json(results);
    });
});

// Editar ticket (solo admin)
router.put('/:id', verificarToken, verificarRol('admin'), (req, res) => {
    const { id } = req.params;
    const body = req.body || {};
    const { titulo, descripcion, estado, tecnico_id, prioridad, impacto, urgencia, fecha_programada, carrera } = body;

    if (fecha_programada !== undefined && fecha_programada !== null && fecha_programada !== '') {
        if (!esFechaProgramadaValida(fecha_programada)) {
            return res.status(400).json({ error: 'La fecha debe ser válida y corresponder a un día laborable de lunes a viernes' });
        }
        if (fecha_programada < fechaActualEnPeru()) {
            return res.status(400).json({ error: 'No se puede programar una fecha pasada' });
        }
    }

    let sql = 'UPDATE tickets SET';
    let params = [];
    
    if (titulo !== undefined && titulo !== '') {
        sql += ' titulo = ?,';
        params.push(titulo);
    }
    
    if (descripcion !== undefined && descripcion !== '') {
        sql += ' descripcion = ?,';
        params.push(descripcion);
    }

    if (carrera !== undefined) {
        const carreraNormalizada = carrera === null || carrera === '' ? null : String(carrera).trim();
        if (carreraNormalizada !== null && !UTEA_PREGRADO_CARRERAS.includes(carreraNormalizada)) {
            return res.status(400).json({ error: 'La carrera seleccionada no es válida para la UTEA' });
        }
        sql += ' carrera = ?,';
        params.push(carreraNormalizada);
    }
    
    if (estado) {
        const estadoNormalizado = normalizarEstado(estado);
        sql += ' estado = ?,';
        params.push(estadoNormalizado);

        if (['Solucionado', 'Cerrado'].includes(estadoNormalizado)) {
            sql += ' sla_resolved_at = COALESCE(sla_resolved_at, ?), sla_first_response_at = COALESCE(sla_first_response_at, ?),';
            params.push(Date.now(), Date.now());
        } else {
            sql += ' sla_resolved_at = NULL,';
        }
    }

    if (prioridad !== undefined && PRIORIDADES_VALIDAS.includes(prioridad)) {
        const slaDeadlines = calculateSlaDeadlines(Date.now(), prioridad);
        sql += ' prioridad = ?, sla_response_due_at = IF(sla_first_response_at IS NULL, ?, sla_response_due_at), sla_resolution_due_at = IF(sla_resolved_at IS NULL, ?, sla_resolution_due_at),';
        params.push(prioridad, slaDeadlines.responseDueAt, slaDeadlines.resolutionDueAt);
    }

    if (impacto !== undefined) {
        sql += ' impacto = ?,';
        params.push(impacto || null);
    }

    if (urgencia !== undefined) {
        sql += ' urgencia = ?,';
        params.push(urgencia || null);
    }
    
    if (tecnico_id !== undefined) {
        sql += ' tecnico_id = ?,';
        params.push(tecnico_id || null);
    }

    if (fecha_programada !== undefined) {
        sql += ' fecha_programada = ?,';
        params.push(fecha_programada || null);
    }
    
    // Remover última coma
    sql = sql.replace(/,$/, '');
    sql += ' WHERE id = ?';
    params.push(id);

    if (params.length === 1) {
        return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    const ejecutarActualizacion = () => db.query(sql, params, (err, result) => {
        if (err) return res.status(500).json(err);

        if (fecha_programada !== undefined) {
            registrarHistorial(
                id,
                req.user.id,
                'programacion',
                fecha_programada ? `Solución programada para el ${fecha_programada}` : 'Se quitó la fecha programada',
                'fecha_programada',
                null,
                fecha_programada || null
            );
        }

        if (estado) {
            registrarHistorial(
                id,
                req.user.id,
                'estado',
                `Estado actualizado a ${normalizarEstado(estado)}`,
                'estado',
                null,
                normalizarEstado(estado)
            );
        }

        if (prioridad !== undefined && PRIORIDADES_VALIDAS.includes(prioridad)) {
            registrarHistorial(
                id,
                req.user.id,
                'prioridad',
                `Prioridad actualizada a ${prioridad}`,
                'prioridad',
                null,
                prioridad
            );
        }

        if (tecnico_id !== undefined) {
            registrarHistorial(
                id,
                req.user.id,
                'tecnico',
                `Técnico asignado actualizado`,
                'tecnico_id',
                null,
                tecnico_id || null
            );
        }

        // Si cambió el estado, notificar al creador del ticket
        if (estado) {
            db.query('SELECT user_id, titulo FROM tickets WHERE id = ?', [id], (err2, ticketData) => {
                if (!err2 && ticketData && ticketData.length > 0) {
                    const ownerId = ticketData[0].user_id;
                    const ticketTitulo = ticketData[0].titulo;
                    if (ownerId && ownerId !== req.user.id) {
                        crearNotificacion(
                            ownerId, 
                            'estado_cambio', 
                            `Tu ticket "${ticketTitulo}" fue actualizado a: ${normalizarEstado(estado)}`, 
                            parseInt(id)
                        );
                    }
                }
            });
        }

        res.json({ mensaje: 'Ticket actualizado' });
    });

    if (fecha_programada) {
        db.query(
            `SELECT estado,
                    (SELECT COUNT(*) FROM tickets
                     WHERE fecha_programada = ? AND id <> ? AND estado NOT IN ('Solucionado', 'Cerrado')) AS cantidad
             FROM tickets WHERE id = ?`,
            [fecha_programada, id, id],
            (err, rows) => {
                if (err) return res.status(500).json({ error: 'No se pudo verificar la agenda del día' });
                if (!rows.length) return res.status(404).json({ error: 'Ticket no encontrado' });
                if (['Solucionado', 'Cerrado'].includes(rows[0].estado)) {
                    return res.status(400).json({ error: 'No se puede programar la solución de un ticket finalizado' });
                }
                ejecutarActualizacion();
            }
        );
        return;
    }

    ejecutarActualizacion();
});

// Registrar encuesta de satisfacción CSAT (1-5 estrellas)
router.post('/:id/encuesta', verificarToken, (req, res) => {
    const ticketId = Number(req.params.id);
    const { calificacion, comentario } = req.body || {};
    const cal = Number(calificacion);

    if (!Number.isInteger(cal) || cal < 1 || cal > 5) {
        return res.status(400).json({ error: 'La calificación debe ser un número entero entre 1 y 5 estrellas' });
    }

    db.query('SELECT user_id, estado FROM tickets WHERE id = ?', [ticketId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'No se pudo verificar el ticket' });
        if (!rows.length) return res.status(404).json({ error: 'Ticket no encontrado' });
        
        if (req.user.rol !== 'admin' && req.user.rol !== 'superadmin' && Number(rows[0].user_id) !== Number(req.user.id)) {
            return res.status(403).json({ error: 'No tienes permiso para calificar este ticket' });
        }

        db.query(
            `INSERT INTO ticket_encuestas (ticket_id, usuario_id, calificacion, comentario)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE calificacion = VALUES(calificacion), comentario = VALUES(comentario)`,
            [ticketId, req.user.id, cal, comentario ? String(comentario).trim() : null],
            (encErr) => {
                if (encErr) return res.status(500).json({ error: 'Error al guardar la encuesta de satisfacción' });
                registrarHistorial(ticketId, req.user.id, 'encuesta', `Encuesta registrada con ${cal} estrellas`);
                res.json({ mensaje: '¡Gracias por evaluar nuestro servicio de soporte TI UTEA!' });
            }
        );
    });
});

// Consultar encuesta del ticket
router.get('/:id/encuesta', verificarToken, (req, res) => {
    const ticketId = Number(req.params.id);
    db.query('SELECT * FROM ticket_encuestas WHERE ticket_id = ?', [ticketId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'No se pudo obtener la encuesta' });
        res.json(rows[0] || null);
    });
});

//eliminar ticket (solo admin/superadmin)
router.delete('/:id', verificarToken, verificarRol('admin', 'superadmin'), (req, res) => {
    const { id } = req.params;

    const sql = 'DELETE FROM tickets WHERE id = ?';

    db.query(sql, [id], (err, result) => {
        if (err) return res.status(500).json(err);

        res.json({ mensaje: 'Ticket eliminado' });
    });
});

module.exports = router;
