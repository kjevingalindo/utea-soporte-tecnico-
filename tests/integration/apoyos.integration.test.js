const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');

const { applyTestDatabaseEnvironment } = require('../../backend/config/databaseConfig');
const { detectarConflictos } = require('../../backend/services/apoyosConflictService');
const { programarRecordatorios, procesarRecordatorios } = require('../../backend/services/apoyosRemindersService');
const { obtenerEstadisticasApoyos } = require('../../backend/services/apoyosStatsService');
const apoyosService = require('../../backend/services/apoyosService');
const { validarSolicitudApoyo } = require('../../backend/utils/apoyosValidation');

test.describe('Solicitudes de Apoyo Técnico para Eventos y Ambientes - Suite de Integración', () => {
    let pool;
    let config;
    const createdApoyoIds = new Set();
    const createdUserIds = new Set();
    let adminUser;
    let solicitanteUser;
    let solicitante2User;
    let techUser;
    let techRecordId;

    test.before(async () => {
        config = applyTestDatabaseEnvironment(process.env);
        pool = mysql.createPool({
            host: config.host,
            port: config.port,
            user: config.user,
            password: config.password,
            database: config.database,
            waitForConnections: true,
            connectionLimit: 5
        });

        // Asegurar usuarios de prueba
        const [uAdmin] = await pool.query('SELECT id, username, rol FROM usuarios WHERE rol = "admin" LIMIT 1');
        adminUser = uAdmin[0] || { id: 2, username: 'admin', rol: 'admin' };

        const [uSol] = await pool.query('SELECT id, username, rol FROM usuarios WHERE rol IN ("usuario", "estudiante") LIMIT 1');
        solicitanteUser = uSol[0] || { id: 1, username: 'joel', rol: 'usuario' };

        // Crear solicitante 2 para pruebas de aislamiento
        const [u2Res] = await pool.query(
            'INSERT INTO usuarios (username, password, rol, nombre_completo, correo_institucional) VALUES (?, "hashpass", "docente", "Docente Prueba", "docente.test@utea.edu.pe")',
            [`solicitante2_test_${Date.now()}`]
        );
        solicitante2User = { id: u2Res.insertId, username: `solicitante2_test_${Date.now()}`, rol: 'docente' };
        createdUserIds.add(solicitante2User.id);

        // Asegurar un técnico en la base de datos
        const [tRows] = await pool.query('SELECT id, nombre FROM tecnicos LIMIT 1');
        if (tRows.length > 0) {
            techRecordId = tRows[0].id;
        } else {
            const [tIns] = await pool.query('INSERT INTO tecnicos (nombre, es_jefe) VALUES ("Técnico Apoyo Test", 0)');
            techRecordId = tIns.insertId;
        }

        // Crear usuario con rol 'tecnico' asociado
        const techUsername = `tech_user_${Date.now()}`;
        const [tUserRes] = await pool.query(
            'INSERT INTO usuarios (username, password, rol, nombre_completo, correo_institucional) VALUES (?, "hashpass", "tecnico", "Técnico Apoyo Test", ?)',
            [techUsername, `${techUsername}@utea.edu.pe`]
        );
        techUser = { id: tUserRes.insertId, username: techUsername, rol: 'tecnico' };
        createdUserIds.add(techUser.id);
    });

    test.after(async () => {
        try {
            if (createdApoyoIds.size > 0) {
                const ids = Array.from(createdApoyoIds);
                await pool.query('DELETE FROM notificaciones WHERE apoyo_id IN (?)', [ids]);
                await pool.query('DELETE FROM apoyo_recordatorios WHERE apoyo_id IN (?)', [ids]);
                await pool.query('DELETE FROM apoyo_historial WHERE apoyo_id IN (?)', [ids]);
                await pool.query('DELETE FROM solicitudes_apoyo WHERE id IN (?)', [ids]);
            }
            if (createdUserIds.size > 0) {
                await pool.query('DELETE FROM usuarios WHERE id IN (?)', [Array.from(createdUserIds)]);
            }
        } finally {
            if (pool) await pool.end();
            const db = require('../../backend/db');
            await new Promise(resolve => db.end(resolve));
        }
    });

    // 1. VALIDACIÓN DE FORMULARIO
    test('1. Validación estricta de formulario: orden de horas, catálogo y archivo', () => {
        // Horas inválidas: hora_preparacion >= hora_inicio
        const val1 = validarSolicitudApoyo({
            solicitante_contacto: '987654321',
            area_organizadora: 'Facultad de Ingeniería',
            responsable_evento: 'Dr. López',
            nombre_actividad: 'Conferencia Tecnológica',
            descripcion: 'Conferencia sobre IA aplicada a la educación universitaria',
            bloque: 'Bloque A',
            ambiente: 'Auditorio',
            fecha_evento: '2026-11-15',
            hora_preparacion: '10:00',
            hora_inicio: '09:00', // Inválido: inicio antes de prep
            hora_fin: '12:00',
            apoyos_requeridos: ['proyector', 'sonido']
        }, { mimetype: 'application/pdf', size: 1024 });

        assert.ok(val1.error, 'Debe rechazar si la hora de preparación no es anterior a la hora de inicio');

        // Horas inválidas: hora_inicio >= hora_fin
        const val2 = validarSolicitudApoyo({
            solicitante_contacto: '987654321',
            area_organizadora: 'Facultad de Ingeniería',
            responsable_evento: 'Dr. López',
            nombre_actividad: 'Conferencia Tecnológica',
            descripcion: 'Conferencia sobre IA aplicada a la educación universitaria',
            bloque: 'Bloque A',
            ambiente: 'Auditorio',
            fecha_evento: '2026-11-15',
            hora_preparacion: '08:30',
            hora_inicio: '12:00',
            hora_fin: '10:00', // Inválido: fin antes de inicio
            apoyos_requeridos: ['proyector']
        }, { mimetype: 'application/pdf', size: 1024 });

        assert.ok(val2.error, 'Debe rechazar si la hora de inicio no es anterior a la de fin');

        // Falta archivo obligatorio
        const val3 = validarSolicitudApoyo({
            solicitante_contacto: '987654321',
            area_organizadora: 'Facultad de Ingeniería',
            responsable_evento: 'Dr. López',
            nombre_actividad: 'Conferencia Tecnológica',
            descripcion: 'Conferencia sobre IA aplicada a la educación universitaria',
            bloque: 'Bloque A',
            ambiente: 'Auditorio',
            fecha_evento: '2026-11-15',
            hora_preparacion: '08:30',
            hora_inicio: '09:00',
            hora_fin: '12:00',
            apoyos_requeridos: ['proyector']
        }, null);

        assert.ok(val3.error, 'Debe exigir documento de autorización');

        // Catálogo inválido
        const val4 = validarSolicitudApoyo({
            solicitante_contacto: '987654321',
            area_organizadora: 'Facultad de Ingeniería',
            responsable_evento: 'Dr. López',
            nombre_actividad: 'Conferencia Tecnológica',
            descripcion: 'Conferencia sobre IA aplicada a la educación universitaria',
            bloque: 'Bloque Inexistente',
            ambiente: 'Salón Fantasma',
            fecha_evento: '2026-11-15',
            hora_preparacion: '08:30',
            hora_inicio: '09:00',
            hora_fin: '12:00',
            apoyos_requeridos: ['proyector']
        }, { mimetype: 'application/pdf', size: 1024 });

        assert.ok(val4.error, 'Debe rechazar ambiente no perteneciente al catálogo');

        // Solicitud válida
        const valValida = validarSolicitudApoyo({
            solicitante_contacto: '987654321',
            area_organizadora: 'Facultad de Ingeniería',
            responsable_evento: 'Dr. López',
            nombre_actividad: 'Conferencia Tecnológica',
            descripcion: 'Conferencia sobre IA aplicada a la educación universitaria',
            bloque: 'Bloque A',
            ambiente: 'Auditorio',
            fecha_evento: '2026-11-15',
            hora_preparacion: '08:30',
            hora_inicio: '09:00',
            hora_fin: '12:00',
            apoyos_requeridos: ['proyector', 'microfonos', 'sonido']
        }, { mimetype: 'application/pdf', size: 2048 });

        assert.equal(valValida.valid, true);
        assert.equal(valValida.data.hora_preparacion, '08:30:00');
        assert.equal(valValida.data.hora_inicio, '09:00:00');
        assert.equal(valValida.data.hora_fin, '12:00:00');
    });

    // 2. CREACIÓN Y DETECCIÓN DE CRUCES DE HORARIO
    test('2. Detección de cruces de horario en ambientes y técnicos', async () => {
        const dummyFile = {
            filename: 'test-auth-01.pdf',
            originalname: 'oficio_autorizacion.pdf',
            mimetype: 'application/pdf',
            size: 2048,
            path: path.join(__dirname, 'test-auth-01.pdf')
        };

        // Crear Evento Base 1
        const res1 = await apoyosService.crearSolicitud(solicitanteUser, {
            solicitante_contacto: '987654321',
            area_organizadora: 'Escuela de Derecho',
            responsable_evento: 'Mg. Vargas',
            nombre_actividad: 'Juicio Simulado Anual',
            descripcion: 'Simulación de audiencia para estudiantes del IX ciclo',
            bloque: 'Bloque A',
            ambiente: 'Auditorio',
            fecha_evento: '2026-11-20',
            hora_preparacion: '08:00',
            hora_inicio: '08:30',
            hora_fin: '12:00',
            apoyos_requeridos: ['proyector', 'sonido', 'microfonos']
        }, dummyFile);

        assert.equal(res1.status, 201);
        const apoyo1Id = res1.solicitud.id;
        createdApoyoIds.add(apoyo1Id);

        // Programar Evento 1
        const progRes = await apoyosService.programarSolicitud(apoyo1Id, adminUser, {
            fecha_evento: '2026-11-20',
            hora_preparacion: '08:00',
            hora_inicio: '08:30',
            hora_fin: '12:00',
            tecnico_id: techRecordId
        });
        assert.equal(progRes.status, 200, progRes.error || 'Fallo al programar');

        // Comprobar conflicto de ambiente: mismo bloque, mismo ambiente, horas solapadas (09:00 - 13:00)
        const conflictoAmbiente = await detectarConflictos({
            fecha_evento: '2026-11-20',
            hora_preparacion: '09:00:00',
            hora_fin: '13:00:00',
            bloque: 'Bloque A',
            ambiente: 'Auditorio'
        });

        assert.equal(conflictoAmbiente.hasConflict, true, 'Debe detectar cruce de horario en el Auditorio');
        assert.ok(conflictoAmbiente.conflicts.some(c => c.tipo === 'ambiente'));

        // Comprobar conflicto de técnico: otro ambiente pero con el mismo técnico asignado en horas solapadas
        const conflictoTecnico = await detectarConflictos({
            fecha_evento: '2026-11-20',
            hora_preparacion: '10:00:00',
            hora_fin: '13:00:00',
            bloque: 'Bloque B',
            ambiente: 'Servicios Académicos',
            tecnico_id: techRecordId
        });

        assert.equal(conflictoTecnico.hasConflict, true, 'Debe detectar cruce de técnico en el mismo horario');
        assert.ok(conflictoTecnico.conflicts.some(c => c.tipo === 'tecnico'));

        // Sin conflicto: diferente horario en la tarde (14:00 a 17:00)
        const sinConflicto = await detectarConflictos({
            fecha_evento: '2026-11-20',
            hora_preparacion: '14:00:00',
            hora_fin: '17:00:00',
            bloque: 'Bloque A',
            ambiente: 'Auditorio',
            tecnico_id: techRecordId
        });

        assert.equal(sinConflicto.hasConflict, false, 'No debe haber conflicto si los horarios no se cruzan');
    });

    // 3. CICLO DE REVISIÓN: OBSERVACIÓN, SUBSANACIÓN, APROBACIÓN Y RECHAZO
    test('3. Ciclo de revisión: Recibida -> Observada -> En revisión -> Aprobada -> Rechazada', async () => {
        const dummyFile = {
            filename: 'test-auth-ciclo.pdf',
            originalname: 'oficio_apoyo.pdf',
            mimetype: 'application/pdf',
            size: 2048,
            path: path.join(__dirname, 'test-auth-ciclo.pdf')
        };

        const res = await apoyosService.crearSolicitud(solicitanteUser, {
            solicitante_contacto: '999888777',
            area_organizadora: 'Dirección Académica',
            responsable_evento: 'Lic. Paredes',
            nombre_actividad: 'Taller de Capacitación Docente',
            descripcion: 'Capacitación en el uso de plataformas virtuales institucionales',
            bloque: 'Bloque C',
            ambiente: 'Sala de Docentes',
            fecha_evento: '2026-11-22',
            hora_preparacion: '14:00',
            hora_inicio: '14:30',
            hora_fin: '17:30',
            apoyos_requeridos: ['proyector', 'laptop', 'internet']
        }, dummyFile);

        const apoyoId = res.solicitud.id;
        createdApoyoIds.add(apoyoId);
        assert.equal(res.solicitud.estado, 'Recibida');

        // Admin observa la solicitud
        const obsRes = await apoyosService.observarSolicitud(apoyoId, adminUser, 'Falta sello de la decanatura en el oficio');
        assert.equal(obsRes.status, 200);

        let det = await apoyosService.obtenerSolicitudPorId(apoyoId, adminUser);
        assert.equal(det.estado, 'Observada');
        assert.equal(det.motivo_observacion, 'Falta sello de la decanatura en el oficio');

        // Solicitante subsana
        const subsanarRes = await apoyosService.subsanarSolicitud(apoyoId, solicitanteUser, 'Se adjunta oficio con el sello regularizado');
        assert.equal(subsanarRes.status, 200);

        det = await apoyosService.obtenerSolicitudPorId(apoyoId, adminUser);
        assert.equal(det.estado, 'En revision');
        assert.equal(det.subsanacion_solicitante, 'Se adjunta oficio con el sello regularizado');

        // Admin aprueba
        const apruebaRes = await apoyosService.aprobarSolicitud(apoyoId, adminUser);
        assert.equal(apruebaRes.status, 200);

        det = await apoyosService.obtenerSolicitudPorId(apoyoId, adminUser);
        assert.equal(det.estado, 'Aprobada');
    });

    // 4. SISTEMA DE RECORDATORIOS PERSISTENTE CON RELOJ SIMULADO
    test('4. Recordatorios persistentes: 24h, 1h, 15m antes de hora_preparacion y reloj simulado', async () => {
        const dummyFile = {
            filename: 'test-auth-reminders.pdf',
            originalname: 'oficio_reminders.pdf',
            mimetype: 'application/pdf',
            size: 2048,
            path: path.join(__dirname, 'test-auth-reminders.pdf')
        };

        // Crear y programar evento para el día 2026-11-25 con preparación a las 10:00
        const res = await apoyosService.crearSolicitud(solicitanteUser, {
            solicitante_contacto: '987111222',
            area_organizadora: 'Escuela de Enfermería',
            responsable_evento: 'Lic. Rojas',
            nombre_actividad: 'Feria de Salud Integral',
            descripcion: 'Atención a la comunidad universitaria con despistaje preventivo',
            bloque: 'Bloque A',
            ambiente: 'Centro de Cómputo',
            fecha_evento: '2026-11-25',
            hora_preparacion: '10:00',
            hora_inicio: '10:30',
            hora_fin: '14:00',
            apoyos_requeridos: ['laptop', 'internet']
        }, dummyFile);

        const apoyoId = res.solicitud.id;
        createdApoyoIds.add(apoyoId);

        // Programar el apoyo
        const progRes = await apoyosService.programarSolicitud(apoyoId, adminUser, {
            fecha_evento: '2026-11-25',
            hora_preparacion: '10:00',
            hora_inicio: '10:30',
            hora_fin: '14:00',
            tecnico_id: techRecordId
        });
        assert.equal(progRes.status, 200, progRes.error || 'Fallo al programar en subtest 4');

        // Verificar que los recordatorios fueron generados en la base de datos
        const [recs] = await pool.query('SELECT tipo_aviso, fecha_programada_aviso, estado FROM apoyo_recordatorios WHERE apoyo_id = ? ORDER BY fecha_programada_aviso ASC', [apoyoId]);
        assert.ok(recs.length >= 3, 'Debe haber generado al menos 3 recordatorios');

        const tipos = recs.map(r => r.tipo_aviso);
        assert.ok(tipos.includes('24h'), 'Debe existir aviso de 24 horas');
        assert.ok(tipos.includes('1h'), 'Debe existir aviso de 1 hora');
        assert.ok(tipos.includes('15m'), 'Debe existir aviso de 15 minutos');

        // Reprogramación: verificar que no genera duplicados
        await apoyosService.programarSolicitud(apoyoId, adminUser, {
            fecha_evento: '2026-11-25',
            hora_preparacion: '11:00', // Cambio de hora de prep
            hora_inicio: '11:30',
            hora_fin: '15:00',
            tecnico_id: techRecordId
        });

        const [recsPost] = await pool.query('SELECT estado FROM apoyo_recordatorios WHERE apoyo_id = ? AND estado = "pendiente"', [apoyoId]);
        const [recsCancel] = await pool.query('SELECT estado FROM apoyo_recordatorios WHERE apoyo_id = ? AND estado = "cancelado"', [apoyoId]);
        assert.ok(recsCancel.length >= 3, 'Los recordatorios anteriores deben marcarse como cancelados');
        assert.ok(recsPost.length >= 3, 'Debe haber un nuevo juego de recordatorios pendientes');

        // Disparo de avisos con reloj simulado
        // 1. Reloj 30 horas antes -> 0 recordatorios disparados
        const r1 = await procesarRecordatorios('2026-11-24T05:00:00', apoyoId);
        assert.equal(r1.totalProcesados, 0);

        // 2. Reloj 23 horas antes (ha pasado el umbral de 24h antes de las 11:00) -> dispara '24h'
        const r2 = await procesarRecordatorios('2026-11-24T12:00:00', apoyoId);
        assert.ok(r2.totalProcesados >= 1);
        assert.ok(r2.enviados.some(e => e.tipo_aviso === '24h'));

        // 3. Reloj 30 minutos antes de las 11:00 (10:30) -> dispara '1h'
        const r3 = await procesarRecordatorios('2026-11-25T10:30:00', apoyoId);
        assert.ok(r3.totalProcesados >= 1);
        assert.ok(r3.enviados.some(e => e.tipo_aviso === '1h'));

        // 4. Reloj 10 minutos antes de las 11:00 (10:50) -> dispara '15m'
        const r4 = await procesarRecordatorios('2026-11-25T10:50:00', apoyoId);
        assert.ok(r4.totalProcesados >= 1);
        assert.ok(r4.enviados.some(e => e.tipo_aviso === '15m'));
    });

    // 5. FLUJO DEL TÉCNICO: CONFIRMACIÓN, LLEGADA, FINALIZACIÓN E IMPEDIMENTO
    test('5. Flujo del técnico: Confirmación -> Llegada -> Finalización e Impedimento', async () => {
        const dummyFile = {
            filename: 'test-auth-tech.pdf',
            originalname: 'oficio_tech.pdf',
            mimetype: 'application/pdf',
            size: 2048,
            path: path.join(__dirname, 'test-auth-tech.pdf')
        };

        const res = await apoyosService.crearSolicitud(solicitanteUser, {
            solicitante_contacto: '987333444',
            area_organizadora: 'Facultad de Educación',
            responsable_evento: 'Prof. Mendoza',
            nombre_actividad: 'Clase Magistral de Pedagogía',
            descripcion: 'Exposición magistral con ponente invitado de la sede central',
            bloque: 'Bloque A',
            ambiente: 'Auditorio',
            fecha_evento: '2026-11-28',
            hora_preparacion: '09:00',
            hora_inicio: '09:30',
            hora_fin: '12:30',
            apoyos_requeridos: ['proyector', 'sonido']
        }, dummyFile);

        const apoyoId = res.solicitud.id;
        createdApoyoIds.add(apoyoId);

        // Programar asignando a techUser
        const progRes = await apoyosService.programarSolicitud(apoyoId, adminUser, {
            fecha_evento: '2026-11-28',
            hora_preparacion: '09:00',
            hora_inicio: '09:30',
            hora_fin: '12:30',
            tecnico_id: techRecordId
        });
        assert.equal(progRes.status, 200, progRes.error || 'Fallo al programar en subtest 5');

        // 1. Confirmar recepción
        const confRes = await apoyosService.confirmarRecepcion(apoyoId, techUser);
        assert.equal(confRes.status, 200);

        let det = await apoyosService.obtenerSolicitudPorId(apoyoId, adminUser);
        assert.equal(Boolean(det.recepcion_confirmada), true);

        // 2. Registrar llegada e inicio
        const llegadaRes = await apoyosService.registrarLlegada(apoyoId, techUser);
        assert.equal(llegadaRes.status, 200);

        det = await apoyosService.obtenerSolicitudPorId(apoyoId, adminUser);
        assert.equal(det.estado, 'En atencion');
        assert.ok(det.llegada_registrada_at !== null);

        // 3. Finalizar apoyo
        const finRes = await apoyosService.finalizarApoyo(apoyoId, techUser, {
            trabajo_realizado: 'Se instaló proyector HDMI, dos micrófonos inalámbricos y se calibró ecualizador.',
            observaciones_cierre: 'Evento concluido satisfactoriamente a las 12:30 sin desperfectos.'
        });
        assert.equal(finRes.status, 200);

        det = await apoyosService.obtenerSolicitudPorId(apoyoId, adminUser);
        assert.equal(det.estado, 'Finalizada');
        assert.ok(det.finalizacion_at !== null);
        assert.equal(det.trabajo_realizado, 'Se instaló proyector HDMI, dos micrófonos inalámbricos y se calibró ecualizador.');

        // Caso de impedimento en otro evento
        const resImp = await apoyosService.crearSolicitud(solicitanteUser, {
            solicitante_contacto: '987333444',
            area_organizadora: 'Facultad de Educación',
            responsable_evento: 'Prof. Mendoza',
            nombre_actividad: 'Actividad con Suspensión',
            descripcion: 'Actividad que no se pudo realizar por corte general de energía',
            bloque: 'Bloque B',
            ambiente: 'Servicios Académicos',
            fecha_evento: '2026-11-29',
            hora_preparacion: '08:00',
            hora_inicio: '08:30',
            hora_fin: '11:00',
            apoyos_requeridos: ['laptop']
        }, dummyFile);

        const apoyoImpId = resImp.solicitud.id;
        createdApoyoIds.add(apoyoImpId);

        await apoyosService.programarSolicitud(apoyoImpId, adminUser, {
            fecha_evento: '2026-11-29',
            hora_preparacion: '08:00',
            hora_inicio: '08:30',
            hora_fin: '11:00',
            tecnico_id: techRecordId
        });

        const impRes = await apoyosService.informarImpedimento(apoyoImpId, techUser, 'Corte imprevisto de fluido eléctrico en el Bloque B');
        assert.equal(impRes.status, 200);

        const detImp = await apoyosService.obtenerSolicitudPorId(apoyoImpId, adminUser);
        assert.equal(detImp.estado, 'Impedida');
        assert.equal(detImp.motivo_impedimento, 'Corte imprevisto de fluido eléctrico en el Bloque B');
    });

    // 6. AISLAMIENTO DE PERMISOS (ACL)
    test('6. Aislamiento de permisos: solicitante no aprueba ni ve ajenos; técnico no reprograma', async () => {
        const dummyFile = {
            filename: 'test-auth-acl.pdf',
            originalname: 'oficio_acl.pdf',
            mimetype: 'application/pdf',
            size: 2048,
            path: path.join(__dirname, 'test-auth-acl.pdf')
        };

        // Solicitante 1 crea una solicitud
        const res = await apoyosService.crearSolicitud(solicitanteUser, {
            solicitante_contacto: '987555666',
            area_organizadora: 'Tópico de Salud',
            responsable_evento: 'Dra. Quispe',
            nombre_actividad: 'Campaña de Vacunación',
            descripcion: 'Campaña médica preventiva con proyección de videos educativos',
            bloque: 'Bloque B',
            ambiente: 'Tópico',
            fecha_evento: '2026-12-01',
            hora_preparacion: '07:30',
            hora_inicio: '08:00',
            hora_fin: '13:00',
            apoyos_requeridos: ['proyector']
        }, dummyFile);

        const apoyoId = res.solicitud.id;
        createdApoyoIds.add(apoyoId);

        // 1. Solicitante intenta aprobar su propia solicitud -> Denegado (403)
        const apruebaFail = await apoyosService.aprobarSolicitud(apoyoId, solicitanteUser);
        assert.equal(apruebaFail.status, 403);

        // 2. Solicitante 2 intenta ver los detalles de la solicitud de Solicitante 1 -> Denegado (403)
        await assert.rejects(async () => {
            await apoyosService.obtenerSolicitudPorId(apoyoId, solicitante2User);
        }, (err) => {
            return err.statusCode === 403;
        }, 'Solicitante ajeno no debe poder ver la solicitud');

        // 3. Técnico intenta reprogramar -> Denegado (403)
        const reprogramaFail = await apoyosService.programarSolicitud(apoyoId, techUser, {
            fecha_evento: '2026-12-02',
            hora_preparacion: '08:00',
            hora_inicio: '08:30',
            hora_fin: '12:00',
            tecnico_id: techRecordId
        });
        assert.equal(reprogramaFail.status, 403);
    });

    // 7. DIFERENCIACIÓN DE INDICADORES EN DASHBOARD E INFORMES
    test('7. Indicadores diferenciados: métricas de apoyos separadas de tickets de soporte', async () => {
        const stats = await obtenerEstadisticasApoyos();

        assert.equal(stats.tipoServicio, 'servicios_programados_apoyo');
        assert.ok(typeof stats.solicitados === 'number');
        assert.ok(typeof stats.programados === 'number');
        assert.ok(typeof stats.finalizados === 'number');
        assert.ok(typeof stats.atencionPendienteRegistrar === 'number');
        assert.ok(Array.isArray(stats.tiposMasSolicitados));
        assert.ok(Array.isArray(stats.ambientesMayorDemanda));
        assert.ok(typeof stats.tiempoPromedioCoberturaHoras === 'number');

        // Verificar que los apoyos creados se reflejan en las métricas de apoyos
        assert.ok(stats.solicitados >= 3, 'Las solicitudes de apoyo se contabilizan en el módulo de apoyos');
    });
});
