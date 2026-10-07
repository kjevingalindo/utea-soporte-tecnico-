INSERT INTO plataformas (nombre, descripcion, activo)
VALUES
    ('No cuento con un correo institucional', 'Solicitudes de creación de correo institucional para personas sin cuenta', TRUE),
    ('Otro', 'Reportes relacionados con plataformas institucionales no listadas', TRUE)
ON DUPLICATE KEY UPDATE
    descripcion = VALUES(descripcion),
    activo = TRUE;