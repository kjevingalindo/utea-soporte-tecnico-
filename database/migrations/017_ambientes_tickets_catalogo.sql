INSERT IGNORE INTO oficinas (codigo, nombre, descripcion, activo) VALUES
    ('TOP', 'Tópico', 'Atención de salud universitaria', TRUE),
    ('SDOC', 'Sala de Docentes', 'Espacio común de docentes', TRUE);

INSERT IGNORE INTO categorias (oficina_id, categoria_padre_id, codigo, nombre)
SELECT id, NULL, 'TOP-ATENCION', 'Incidencias del tópico'
FROM oficinas WHERE codigo = 'TOP';

INSERT IGNORE INTO categorias (oficina_id, categoria_padre_id, codigo, nombre)
SELECT id, NULL, 'SDOC-EQUIPOS', 'Equipamiento de sala de docentes'
FROM oficinas WHERE codigo = 'SDOC';