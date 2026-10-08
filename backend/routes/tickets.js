const express = require('express');
const router = express.Router();
const db = require('../db');
const verificarToken = require('../middleware/authMiddleware');
const { verificarRol } = require('../middleware/roleMiddleware');
const { crearNotificacion } = require('./notifications');
const { registrarHistorial } = require('./historial');
const { calculateSlaDeadlines } = require('../utils/sla');
const { UTEA_PREGRADO_CARRERAS } = require('../utils/uteaConfig');
const requireTicketAccess = require('../middleware/ticketAccess');
const {
    canListAllTickets,
    TICKET_ATTACHMENT_ROLES,
    TICKET_SURVEY_ROLES,
    TICKET_ASSIGNMENT_ROLES
} = require('../utils/accessControl');
const { validateTicketCreation } = require('../utils/ticketValidation');
const { isValidTicketState, canTransitionTicket } = require('../utils/ticketStates');
const { fingerprint } = require('../utils/idempotency');
const requireIdempotencyKey = require('../middleware/idempotencyKey');

const PRIORIDADES_VALIDAS = ['Baja', 'Media', 'Alta', 'Urgente', 'Critica'];
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
router.post('/', verificarToken, requireIdempotencyKey, (req, res) => {
    const validation = validateTicketCreation(req.body);
    if (validation.error) return res.status(400).json({ error: validation.error });
    const {
        titulo, descripcion, tecnico_id, oficina_id, categoria_id, categoria_usuario,
        solicitante_nombre, codigo_universitario_dni, tipo_solicitante,
        impacto, urgencia
    } = validation.value;
    const requestHash = fingerprint(validation.value);

    const prioridadFinal = calcularPrioridad(impacto, urgencia);
    if (!PRIORIDADES_VALIDAS.includes(prioridadFinal)) {
        return res.status(400).json({ error: 'La prioridad no es valida' });
    }
    const {
        carrera: carreraNormalizada,
        bloque: bloqueNormalizado,
        ambiente: ambienteNormalizado,
        ubicacion: ubicacionNormalizada,
        aula: aulaNormalizada,
        asignatura_area: asignaturaAreaNormalizada
    } = validation.value;
    const rolPuedeAsignarTecnico = TICKET_ASSIGNMENT_ROLES.has(String(req.user.rol || '').toLowerCase());
    const tieneTecnicoSeleccionado = rolPuedeAsignarTecnico && tecnico_id !== undefined && tecnico_id !== null && tecnico_id !== '';
    if (tieneTecnicoSeleccionado &&
        (!(typeof tecnico_id === 'number' || (typeof tecnico_id === 'string' && /^\d+$/.test(tecnico_id))) ||
            !Number.isSafeInteger(Number(tecnico_id)) || Number(tecnico_id) < 1)) {
        return res.status(400).json({ error: 'El técnico seleccionado no es válido' });
    }

    const findExistingRequest = callback => db.query(
        'SELECT id, idempotency_hash FROM tickets WHERE user_id = ? AND idempotency_key = ?',
        [req.user.id, req.idempotencyKey],
        callback
    );
    const respondWithExisting = (rows, status = 200) => {
        if (!rows.length) return res.status(500).json({ error: 'No se pudo confirmar el resultado de la creación' });
        if (rows[0].idempotency_hash !== requestHash) {
            return res.status(409).json({ error: 'La clave de reintento ya se usó con datos distintos. Inicia una nueva solicitud.' });
        }
        return res.status(status).json({
            mensaje: 'El ticket de esta solicitud ya estaba creado',
            ticketId: rows[0].id,
            replayed: true
        });
    };

    findExistingRequest((lookupError, existing) => {
        if (lookupError) return res.status(500).json({ error: 'No se pudo verificar la clave de creación' });
        if (existing.length) return respondWithExisting(existing);

    const insertarTicket = () => {
        const tecnicoSql = tieneTecnicoSeleccionado
            ? `SELECT t.id FROM tecnico_oficinas ot
               INNER JOIN tecnicos t ON t.id = ot.tecnico_id
               WHERE ot.oficina_id = ? AND t.id = ?
               LIMIT 1`
            : `SELECT t.id FROM tecnico_oficinas ot
               INNER JOIN tecnicos t ON t.id = ot.tecnico_id
               WHERE ot.oficina_id = ?
               ORDER BY ot.es_responsable DESC, t.id
               LIMIT 1`;
        const tecnicoParams = tieneTecnicoSeleccionado
            ? [oficina_id, Number(tecnico_id)]
            : [oficina_id];
        db.query(tecnicoSql, tecnicoParams, (err, results) => {
        if (err) return res.status(500).json(err);
        if (tieneTecnicoSeleccionado && results.length === 0) {
            return res.status(400).json({ error: 'El técnico seleccionado no pertenece a la oficina' });
        }
        
        const jefeId = results.length > 0 ? results[0].id : null;
        const estadoInicial = jefeId ? 'Asignado' : 'Creado';
        const slaDeadlines = calculateSlaDeadlines(Date.now(), prioridadFinal);
        const sql = `INSERT INTO tickets
            (titulo, descripcion, estado, prioridad, tecnico_id, user_id, oficina_id, categoria_id, categoria_usuario, carrera, bloque, ambiente, aula, asignatura_area,
             ubicacion, solicitante_nombre, codigo_universitario_dni, tipo_solicitante, impacto, urgencia,
             sla_response_due_at, sla_resolution_due_at, idempotency_key, idempotency_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) `;

        db.query(sql, [
            titulo, descripcion, estadoInicial, prioridadFinal, jefeId, req.user.id,
            oficina_id,
            categoria_id,
            categoria_usuario,
            carreraNormalizada,
            bloqueNormalizado,
            ambienteNormalizado,
            aulaNormalizada,
            asignaturaAreaNormalizada,
            ubicacionNormalizada,
            solicitante_nombre.trim(),
            codigo_universitario_dni.trim(),
            tipo_solicitante,
            impacto,
            urgencia,
            slaDeadlines.responseDueAt,
            slaDeadlines.resolutionDueAt,
            req.idempotencyKey,
            requestHash
        ], (err, result) => {
            if (err) {
                if (err.code !== 'ER_DUP_ENTRY') return res.status(500).json({ error: 'No se pudo crear el ticket' });
                return findExistingRequest((lookupError, existingRows) => {
                    if (lookupError) return res.status(500).json({ error: 'No se pudo confirmar el ticket creado' });
                    return respondWithExisting(existingRows);
                });
            }

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
                            ).catch(notificationError => {
                                console.error('No se pudo notificar la creación del ticket:', notificationError.message);
                            });
                        }
                    });
                }
            });

            const mensaje = jefeId
                ? 'Ticket creado y asignado a un técnico de la oficina'
                : 'Ticket creado; no hay técnico asignable y queda pendiente de asignación';
            res.status(201).json({ mensaje, ticketId });
        });
        });
    };

    db.query(`SELECT c.id
              FROM categorias c
              INNER JOIN oficinas o ON o.id = c.oficina_id
              WHERE c.id = ? AND c.oficina_id = ? AND c.activo = TRUE AND o.activo = TRUE`,
        [categoria_id, oficina_id], (err, rows) => {
            if (err) return res.status(500).json({ error: 'No se pudo validar la oficina y categoría' });
            if (!rows.length) return res.status(400).json({ error: 'La categoria no pertenece a la oficina o esta inactiva' });
            insertarTicket();
        });
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
    
    const esAdminRol = canListAllTickets(req.user);
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
        whereClauses.push('(tickets.titulo LIKE ? OR tickets.solicitante_nombre LIKE ? OR tickets.descripcion LIKE ? OR usuarios.username LIKE ? OR tickets.categoria_usuario LIKE ? OR categorias.nombre LIKE ? OR oficinas.nombre LIKE ? OR CAST(tickets.id AS CHAR) LIKE ?)');
        const searchPattern = `%${busqueda.trim()}%`;
        params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
    }

    const whereSql = whereClauses.length ? ' WHERE ' + whereClauses.join(' AND ') : '';

    if (!isPaginated) {
        const sql = `SELECT tickets.*, tecnicos.nombre AS tecnico, usuarios.username,
                            oficinas.nombre AS oficina_nombre, categorias.nombre AS categoria_nombre,
                            DATE_FORMAT(tickets.fecha_programada, '%Y-%m-%d') AS fecha_programada_iso,
                            (SELECT GROUP_CONCAT(UNIX_TIMESTAMP(th.created_at) * 1000
                                                 ORDER BY th.created_at SEPARATOR ',')
                             FROM ticket_historial th
                             WHERE th.ticket_id = tickets.id
                               AND th.campo = 'estado'
                               AND th.valor_nuevo IN ('Solucionado', 'Cerrado')) AS report_resolutions_ms
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
                                DATE_FORMAT(tickets.fecha_programada, '%Y-%m-%d') AS fecha_programada_iso,
                                (SELECT GROUP_CONCAT(UNIX_TIMESTAMP(th.created_at) * 1000
                                                     ORDER BY th.created_at SEPARATOR ',')
                                 FROM ticket_historial th
                                 WHERE th.ticket_id = tickets.id
                                   AND th.campo = 'estado'
                                   AND th.valor_nuevo IN ('Solucionado', 'Cerrado')) AS report_resolutions_ms
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

router.get('/:id/historial', verificarToken, requireTicketAccess({
    parameter: 'id',
    roles: TICKET_ATTACHMENT_ROLES
}), (req, res) => {
    const { id } = req.params;

    db.query(`SELECT th.*, u.username
              FROM ticket_historial th
              LEFT JOIN usuarios u ON u.id = th.usuario_id
              WHERE th.ticket_id = ?
              ORDER BY th.created_at ASC`, [id], (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results);
    });
});

// Editar ticket (solo admin)
router.put('/:id', verificarToken, verificarRol('admin'), (req, res) => {
    const { id } = req.params;
    const body = req.body || {};
    const { titulo, descripcion, estado, tecnico_id, prioridad, impacto, urgencia, fecha_programada, carrera } = body;
    if (estado !== undefined && !isValidTicketState(estado)) {
        return res.status(400).json({ error: 'El estado del ticket no es válido' });
    }

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
    
    if (estado !== undefined) {
        const estadoNormalizado = estado;
        sql += ' estado = ?,';
        params.push(estadoNormalizado);

        if (['Solucionado', 'Cerrado'].includes(estadoNormalizado)) {
            sql += ' sla_resolved_at = COALESCE(sla_resolved_at, ?),';
            params.push(Date.now());
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

    const ejecutarActualizacion = expectedState => {
        const updateSql = sql + (expectedState === null ? '' : ' AND estado = ?');
        const updateParams = expectedState === null ? params : [...params, expectedState];
        db.query(updateSql, updateParams, (err, result) => {
        if (err) return res.status(500).json(err);
        if (expectedState !== null && result.affectedRows === 0) {
            return db.query('SELECT estado FROM tickets WHERE id = ?', [id], (stateError, rows) => {
                if (stateError) return res.status(500).json({ error: 'No se pudo confirmar el estado del ticket' });
                if (!rows.length) return res.status(404).json({ error: 'Ticket no encontrado' });
                if (rows[0].estado !== expectedState) {
                    return res.status(409).json({ error: 'El ticket cambió desde que lo consultaste; vuelve a cargarlo.' });
                }
                res.json({ mensaje: 'Ticket ya estaba en ese estado', estado: expectedState });
            });
        }

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

        if (estado !== undefined && estado !== expectedState) {
            registrarHistorial(
                id,
                req.user.id,
                'estado',
                `Estado actualizado de ${expectedState} a ${estado}`,
                'estado',
                expectedState,
                estado
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
        if (estado !== undefined && estado !== expectedState) {
            db.query('SELECT user_id, titulo FROM tickets WHERE id = ?', [id], (err2, ticketData) => {
                if (!err2 && ticketData && ticketData.length > 0) {
                    const ownerId = ticketData[0].user_id;
                    const ticketTitulo = ticketData[0].titulo;
                    if (ownerId && ownerId !== req.user.id) {
                        crearNotificacion(
                            ownerId, 
                            'estado_cambio', 
                            `Tu ticket "${ticketTitulo}" fue actualizado a: ${estado}`,
                            parseInt(id)
                        ).catch(notificationError => {
                            console.error('No se pudo notificar el cambio de estado del ticket:', notificationError.message);
                        });
                    }
                }
            });
        }

        res.json({ mensaje: 'Ticket actualizado', estado });
        });
    };

    const validarEstadoYActualizar = () => {
        if (estado === undefined) return ejecutarActualizacion(null);
        db.query('SELECT estado FROM tickets WHERE id = ?', [id], (err, rows) => {
            if (err) return res.status(500).json({ error: 'No se pudo consultar el estado actual del ticket' });
            if (!rows.length) return res.status(404).json({ error: 'Ticket no encontrado' });
            const estadoActual = rows[0].estado;
            if (!canTransitionTicket(estadoActual, estado)) {
                return res.status(409).json({ error: `No se permite cambiar el ticket de ${estadoActual} a ${estado}` });
            }
            ejecutarActualizacion(estadoActual);
        });
    };

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
                validarEstadoYActualizar();
            }
        );
        return;
    }

    validarEstadoYActualizar();
});

// Registrar encuesta de satisfacción CSAT (1-5 estrellas)
router.post('/:id/encuesta', verificarToken, requireTicketAccess({
    parameter: 'id',
    roles: TICKET_SURVEY_ROLES
}), (req, res) => {
    const ticketId = Number(req.params.id);
    const { calificacion, comentario } = req.body || {};
    const cal = Number(calificacion);

    if (!Number.isInteger(cal) || cal < 1 || cal > 5) {
        return res.status(400).json({ error: 'La calificación debe ser un número entero entre 1 y 5 estrellas' });
    }

    db.query('SELECT user_id, estado FROM tickets WHERE id = ?', [ticketId], (err, rows) => {
        if (err) return res.status(500).json({ error: 'No se pudo verificar el ticket' });
        if (!rows.length) return res.status(404).json({ error: 'Ticket no encontrado' });
        
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
router.get('/:id/encuesta', verificarToken, requireTicketAccess({
    parameter: 'id',
    roles: TICKET_SURVEY_ROLES
}), (req, res) => {
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
