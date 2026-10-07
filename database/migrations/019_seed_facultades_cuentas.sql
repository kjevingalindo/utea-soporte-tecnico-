INSERT INTO plataformas (nombre, descripcion, activo)
VALUES
    ('Gmail Institucional', 'Correo electrónico UTEA (@utea.edu.pe)', TRUE),
    ('Google Classroom', 'Aulas virtuales y entrega de tareas', TRUE),
    ('ERP University UTEA', 'Sistema de gestión académica, matrícula y notas UTEA', TRUE)
ON DUPLICATE KEY UPDATE
    descripcion = VALUES(descripcion),
    activo = TRUE;

CREATE TABLE IF NOT EXISTS facultades (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO facultades (nombre)
VALUES
    ('Facultad de Ingeniería'),
    ('Facultad de Ciencias Jurídicas, Contables y Sociales'),
    ('Facultad de Ciencias de la Salud')
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre);
