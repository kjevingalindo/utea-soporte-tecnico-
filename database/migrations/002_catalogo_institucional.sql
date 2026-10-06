CREATE TABLE IF NOT EXISTS oficinas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(20) NOT NULL UNIQUE,
    nombre VARCHAR(150) NOT NULL,
    descripcion VARCHAR(500),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS categorias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    oficina_id INT NOT NULL,
    categoria_padre_id INT,
    codigo VARCHAR(40) NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    descripcion VARCHAR(500),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_categorias_oficina_codigo UNIQUE (oficina_id, codigo),
    CONSTRAINT uq_categorias_id_oficina UNIQUE (id, oficina_id),
    CONSTRAINT fk_categorias_oficina FOREIGN KEY (oficina_id) REFERENCES oficinas(id) ON DELETE RESTRICT,
    CONSTRAINT fk_categorias_padre_oficina FOREIGN KEY (categoria_padre_id, oficina_id)
        REFERENCES categorias(id, oficina_id) ON DELETE RESTRICT,
    INDEX idx_categorias_oficina_activo (oficina_id, activo, nombre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tecnico_oficinas (
    tecnico_id INT NOT NULL,
    oficina_id INT NOT NULL,
    es_responsable BOOLEAN NOT NULL DEFAULT FALSE,
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tecnico_id, oficina_id),
    CONSTRAINT fk_tecnico_oficinas_tecnico FOREIGN KEY (tecnico_id) REFERENCES tecnicos(id) ON DELETE CASCADE,
    CONSTRAINT fk_tecnico_oficinas_oficina FOREIGN KEY (oficina_id) REFERENCES oficinas(id) ON DELETE CASCADE,
    INDEX idx_tecnico_oficinas_oficina (oficina_id, es_responsable)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO oficinas (codigo, nombre, descripcion) VALUES
    ('OTI', 'Oficina de Tecnologias de Informacion', 'Soporte de infraestructura y sistemas institucionales'),
    ('BIB', 'Biblioteca', 'Servicios bibliotecarios y sus sistemas'),
    ('REG', 'Registros Academicos', 'Matriculas, actas, notas y constancias'),
    ('ADM', 'Administracion', 'Equipos y sistemas administrativos'),
    ('LAB', 'Laboratorios', 'Equipos, software especializado y redes de laboratorio');

INSERT IGNORE INTO categorias (oficina_id, categoria_padre_id, codigo, nombre)
SELECT o.id, NULL, c.codigo, c.nombre
FROM oficinas o
JOIN (
    SELECT 'OTI' oficina, 'OTI-HARDWARE' codigo, 'Hardware' nombre UNION ALL
    SELECT 'OTI', 'OTI-SOFTWARE', 'Software' UNION ALL
    SELECT 'OTI', 'OTI-REDES', 'Redes' UNION ALL
    SELECT 'OTI', 'OTI-INTERNET', 'Internet' UNION ALL
    SELECT 'OTI', 'OTI-SISTEMAS-ACADEMICOS', 'Sistemas academicos' UNION ALL
    SELECT 'OTI', 'OTI-CORREO', 'Correo institucional' UNION ALL
    SELECT 'OTI', 'OTI-PLATAFORMA-VIRTUAL', 'Plataforma virtual' UNION ALL
    SELECT 'OTI', 'OTI-SEGURIDAD', 'Seguridad informatica' UNION ALL
    SELECT 'BIB', 'BIB-SISTEMA', 'Acceso al sistema bibliotecario' UNION ALL
    SELECT 'BIB', 'BIB-EQUIPOS', 'Equipos' UNION ALL
    SELECT 'BIB', 'BIB-INTERNET', 'Internet' UNION ALL
    SELECT 'BIB', 'BIB-USUARIOS', 'Usuarios' UNION ALL
    SELECT 'REG', 'REG-MATRICULAS', 'Matriculas' UNION ALL
    SELECT 'REG', 'REG-ACTAS', 'Actas' UNION ALL
    SELECT 'REG', 'REG-NOTAS', 'Notas' UNION ALL
    SELECT 'REG', 'REG-CONSTANCIAS', 'Constancias' UNION ALL
    SELECT 'ADM', 'ADM-EQUIPOS', 'Equipos administrativos' UNION ALL
    SELECT 'ADM', 'ADM-SISTEMAS', 'Sistemas internos' UNION ALL
    SELECT 'LAB', 'LAB-COMPUTADORAS', 'Computadoras' UNION ALL
    SELECT 'LAB', 'LAB-SOFTWARE', 'Software especializado' UNION ALL
    SELECT 'LAB', 'LAB-RED', 'Red'
) c ON c.oficina = o.codigo;

INSERT IGNORE INTO categorias (oficina_id, categoria_padre_id, codigo, nombre)
SELECT p.oficina_id, p.id, c.codigo, c.nombre
FROM categorias p
JOIN (
    SELECT 'OTI-HARDWARE' padre, 'OTI-HW-PC' codigo, 'PC no enciende' nombre UNION ALL
    SELECT 'OTI-HARDWARE', 'OTI-HW-MONITOR', 'Monitor' UNION ALL
    SELECT 'OTI-HARDWARE', 'OTI-HW-IMPRESORA', 'Impresora' UNION ALL
    SELECT 'OTI-HARDWARE', 'OTI-HW-TECLADO', 'Teclado' UNION ALL
    SELECT 'OTI-HARDWARE', 'OTI-HW-MOUSE', 'Mouse' UNION ALL
    SELECT 'OTI-REDES', 'OTI-RED-SIN-INTERNET', 'Sin internet' UNION ALL
    SELECT 'OTI-REDES', 'OTI-RED-WIFI-LENTO', 'Wi-Fi lento' UNION ALL
    SELECT 'OTI-REDES', 'OTI-RED-CABLE', 'Cable de red danado' UNION ALL
    SELECT 'OTI-REDES', 'OTI-RED-IP', 'Problemas IP' UNION ALL
    SELECT 'OTI-REDES', 'OTI-RED-VPN', 'VPN'
) c ON c.padre = p.codigo;