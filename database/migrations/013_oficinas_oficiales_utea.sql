-- Migración 013: Estructura Completa de Oficinas y Direcciones UTEA Sede Andahuaylas

INSERT IGNORE INTO oficinas (codigo, nombre, descripcion, activo) VALUES
    ('SAC', 'Servicios Académicos', 'Matrículas, actas, certificados y registros académicos', TRUE),
    ('ADMIS', 'Admisión', 'Procesos de admisión, postulantes e inscripción institucional', TRUE),
    ('GYT', 'Grados y Títulos', 'Tramitación de grados de bachiller, títulos profesionales y expedientes', TRUE),
    ('MDP', 'Mesa de Partes', 'Recepción de solicitudes, sistema de trámite documentario y licencias', TRUE),
    ('ADM', 'Administración', 'Gestión administrativa, contable, logística y servicios generales', TRUE),
    ('SUB-DER', 'Sub Dirección de Derecho', 'Dirección académica, coordinaciones y atención docente de la carrera de Derecho', TRUE),
    ('SUB-ING', 'Sub Dirección de Agronomía, Ing. Ambiental e Ing. Civil', 'Dirección académica y coordinaciones de las facultades de Ingeniería y Agronomía', TRUE),
    ('SUB-CED', 'Sub Dirección de Contabilidad y Educación', 'Dirección académica y coordinaciones de las facultades de Contabilidad y Educación', TRUE),
    ('SUB-ENF', 'Sub Dirección de Enfermería', 'Dirección académica, coordinaciones y gabinete de la carrera de Enfermería', TRUE),
    ('AUL', 'Aulas de Clase', 'Proyectores multimedia, ecran, audio y redes en aulas de enseñanza', TRUE),
    ('LAB', 'Laboratorios', 'Laboratorios de cómputo, informática, licencias de software y equipos de simulación', TRUE);

-- Actualizar nombres y descripciones en caso de existencia previa
UPDATE oficinas SET nombre = 'Servicios Académicos', descripcion = 'Matrículas, actas, certificados y registros académicos' WHERE codigo = 'SAC';
UPDATE oficinas SET nombre = 'Admisión', descripcion = 'Procesos de admisión, postulantes e inscripción institucional' WHERE codigo = 'ADMIS';
UPDATE oficinas SET nombre = 'Grados y Títulos', descripcion = 'Tramitación de grados de bachiller, títulos profesionales y expedientes' WHERE codigo = 'GYT';
UPDATE oficinas SET nombre = 'Mesa de Partes', descripcion = 'Recepción de solicitudes, sistema de trámite documentario y licencias' WHERE codigo = 'MDP';
UPDATE oficinas SET nombre = 'Administración', descripcion = 'Gestión administrativa, contable, logística y servicios generales' WHERE codigo = 'ADM';
UPDATE oficinas SET nombre = 'Sub Dirección de Derecho', descripcion = 'Dirección académica, coordinaciones y atención docente de la carrera de Derecho' WHERE codigo = 'SUB-DER';
UPDATE oficinas SET nombre = 'Sub Dirección de Agronomía, Ing. Ambiental e Ing. Civil', descripcion = 'Dirección académica y coordinaciones de las facultades de Ingeniería y Agronomía' WHERE codigo = 'SUB-ING';
UPDATE oficinas SET nombre = 'Sub Dirección de Contabilidad y Educación', descripcion = 'Dirección académica y coordinaciones de las facultades de Contabilidad y Educación' WHERE codigo = 'SUB-CED';
UPDATE oficinas SET nombre = 'Sub Dirección de Enfermería', descripcion = 'Dirección académica, coordinaciones y gabinete de la carrera de Enfermería' WHERE codigo = 'SUB-ENF';
UPDATE oficinas SET nombre = 'Aulas de Clase', descripcion = 'Proyectores multimedia, ecran, audio y redes en aulas de enseñanza' WHERE codigo = 'AUL';
UPDATE oficinas SET nombre = 'Laboratorios', descripcion = 'Laboratorios de cómputo, informática, licencias de software y equipos de simulación' WHERE codigo = 'LAB';

-- Insertar categorías principales para todas las oficinas institucionales UTEA
INSERT IGNORE INTO categorias (oficina_id, categoria_padre_id, codigo, nombre)
SELECT o.id, NULL, c.codigo, c.nombre
FROM oficinas o
JOIN (
    -- Servicios Académicos
    SELECT 'SAC' oficina, 'SAC-MATRICULAS' codigo, 'Matrículas y Constancias' nombre UNION ALL
    SELECT 'SAC', 'SAC-NOTAS', 'Actas de Notas y Registro' UNION ALL
    -- Admisión
    SELECT 'ADMIS', 'ADMIS-POSTULANTE', 'Sistema de Postulantes' UNION ALL
    SELECT 'ADMIS', 'ADMIS-EQUIPOS', 'Equipos de Admisión' UNION ALL
    -- Grados y Títulos
    SELECT 'GYT', 'GYT-EXPEDIENTES', 'Sistema de Expedientes' UNION ALL
    SELECT 'GYT', 'GYT-EQUIPOS', 'Equipos e Impresoras de Grados' UNION ALL
    -- Mesa de Partes
    SELECT 'MDP', 'MDP-TRAMITE', 'Sistema de Trámite Documentario' UNION ALL
    SELECT 'MDP', 'MDP-EQUIPOS', 'Escáner e Impresoras de Ventanilla' UNION ALL
    -- Administración
    SELECT 'ADM', 'ADM-EQUIPOS', 'Equipos Administrativos' UNION ALL
    SELECT 'ADM', 'ADM-SISTEMAS', 'Sistemas e Intranet' UNION ALL
    -- Sub Direcciones Académicas
    SELECT 'SUB-DER', 'SUBDER-EQUIPOS', 'Equipos de Sub Dirección Derecho' UNION ALL
    SELECT 'SUB-ING', 'SUBING-EQUIPOS', 'Equipos de Sub Dirección Ingenierías / Agronomía' UNION ALL
    SELECT 'SUB-CED', 'SUBCED-EQUIPOS', 'Equipos de Sub Dirección Contabilidad / Educación' UNION ALL
    SELECT 'SUB-ENF', 'SUBENF-EQUIPOS', 'Equipos de Sub Dirección Enfermería' UNION ALL
    -- Aulas
    SELECT 'AUL', 'AUL-PROYECTOR', 'Proyector / Ecran Multimedia' UNION ALL
    SELECT 'AUL', 'AUL-AUDIO', 'Audio y Parlantes de Aula' UNION ALL
    SELECT 'AUL', 'AUL-CONECTIVIDAD', 'Wi-Fi / Red en Aula' UNION ALL
    -- Laboratorios
    SELECT 'LAB', 'LAB-COMPUTADORAS', 'PCs de Laboratorio' UNION ALL
    SELECT 'LAB', 'LAB-SOFTWARE', 'Software Especializado' UNION ALL
    SELECT 'LAB', 'LAB-RED', 'Red LAN y Switcheo de Lab'
) c ON c.oficina = o.codigo;

-- Insertar Auto-Diagnóstico de Aula UTEA
INSERT IGNORE INTO auto_diagnosticos (categoria_codigo, titulo, problema_frecuente, sintomas, pasos_diagnostico, solucion_rapida) VALUES
('AUL-PROYECTOR', 'Diagnóstico Proyector / Pantalla en Aulas de Clase', 'El proyector no enciende o no muestra la pantalla de la laptop', 'Luz roja parpadeando en el proyector, mensaje Sin Señal (No Signal)',
 '["1. Verificar que el cable HDMI/VGA esté firmemente conectado a la laptop y al selector de pared del aula.", "2. Presionar las teclas Windows + P en la laptop y seleccionar Duplicar.", "3. Comprobar que el proyector esté encendido mediante el control remoto del aula.", "4. Verificar que el interruptor de energía del aula no haya saltado."]',
 'Si la laptop es de modelo reciente sin puerto HDMI directo, solicite un adaptador certificado en la Oficina de Tecnologías de Información.');
