INSERT INTO plataformas (nombre, descripcion, activo)
VALUES
    ('Gmail Institucional', 'Correo electrónico institucional UTEA (@utea.edu.pe)', TRUE),
    ('Google Classroom', 'Plataforma de aulas virtuales y gestión de clases', TRUE),
    ('ERP University UTEA', 'Sistema de gestión académica, matrícula y notas UTEA', TRUE)
ON DUPLICATE KEY UPDATE activo = TRUE;
