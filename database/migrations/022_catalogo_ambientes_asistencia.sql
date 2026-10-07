INSERT INTO categorias (oficina_id, categoria_padre_id, codigo, nombre, descripcion, activo)
SELECT o.id, NULL, c.codigo, c.nombre, c.descripcion, TRUE
FROM oficinas o
JOIN (
    SELECT 'BIB' AS oficina, 'BIB-EQUIPOS' AS codigo, 'Equipos y sistemas de biblioteca' AS nombre,
           'Equipos y sistemas de atención en biblioteca' AS descripcion UNION ALL
    SELECT 'AUL', 'AUL-AUDIO', 'Audio y parlantes de auditorio', 'Equipos audiovisuales del auditorio' UNION ALL
    SELECT 'LAB', 'LAB-COMPUTADORAS', 'Computadoras de laboratorio', 'Equipos informáticos de los laboratorios' UNION ALL
    SELECT 'ADM', 'ADM-ASISTENCIA', 'Sistema de asistencia', 'Equipos y sistema de marcación de asistencia de docentes y administrativos'
) c ON c.oficina = o.codigo
ON DUPLICATE KEY UPDATE
    activo = TRUE;
