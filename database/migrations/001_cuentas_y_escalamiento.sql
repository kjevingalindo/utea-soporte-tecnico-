CREATE TABLE IF NOT EXISTS plataformas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL UNIQUE,
    descripcion TEXT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS incidencias_cuentas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_id INT NULL,
    plataforma_id INT NOT NULL,
    usuario_id INT NOT NULL,
    tipo_usuario VARCHAR(50) NOT NULL,
    dni_codigo VARCHAR(40) NOT NULL,
    nombres VARCHAR(150) NOT NULL,
    apellidos VARCHAR(150) NOT NULL,
    correo_alternativo VARCHAR(254) NULL,
    telefono VARCHAR(30) NULL,
    facultad VARCHAR(150) NULL,
    oficina_id INT NULL,
    tipo_problema VARCHAR(150) NOT NULL,
    descripcion TEXT NOT NULL,
    solucion TEXT NULL,
    estado VARCHAR(40) NOT NULL DEFAULT 'NUEVO',
    prioridad VARCHAR(20) NOT NULL DEFAULT 'MEDIA',
    usuario_resolvio INT NULL,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_resolucion TIMESTAMP NULL DEFAULT NULL,
    CONSTRAINT fk_incidencias_cuentas_plataforma
        FOREIGN KEY (plataforma_id) REFERENCES plataformas(id) ON DELETE RESTRICT,
    INDEX idx_incidencias_cuentas_plataforma_fecha (plataforma_id, fecha_creacion),
    INDEX idx_incidencias_cuentas_usuario_fecha (usuario_id, fecha_creacion),
    INDEX idx_incidencias_cuentas_estado (estado),
    INDEX idx_incidencias_cuentas_ticket (ticket_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS escalamientos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    incidencia_id INT NOT NULL,
    origen VARCHAR(100) NOT NULL,
    destino VARCHAR(100) NOT NULL,
    motivo TEXT NOT NULL,
    usuario_escalo INT NOT NULL,
    fecha_escalamiento TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_resolucion TIMESTAMP NULL DEFAULT NULL,
    estado VARCHAR(40) NOT NULL DEFAULT 'PENDIENTE',
    CONSTRAINT fk_escalamientos_incidencia
        FOREIGN KEY (incidencia_id) REFERENCES incidencias_cuentas(id) ON DELETE CASCADE,
    INDEX idx_escalamientos_incidencia_fecha (incidencia_id, fecha_escalamiento),
    INDEX idx_escalamientos_destino_estado (destino, estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS historial_tickets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_id INT NULL,
    incidencia_id INT NULL,
    usuario_id INT NULL,
    accion VARCHAR(50) NOT NULL,
    estado_anterior VARCHAR(40) NULL,
    estado_nuevo VARCHAR(40) NULL,
    comentario TEXT NULL,
    fecha TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_historial_tickets_incidencia
        FOREIGN KEY (incidencia_id) REFERENCES incidencias_cuentas(id) ON DELETE CASCADE,
    INDEX idx_historial_tickets_ticket_fecha (ticket_id, fecha),
    INDEX idx_historial_tickets_incidencia_fecha (incidencia_id, fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS incidencia_cuenta_evidencias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    incidencia_id INT NOT NULL,
    usuario_id INT NOT NULL,
    tipo VARCHAR(40) NOT NULL,
    nombre_original VARCHAR(255) NOT NULL,
    nombre_archivo VARCHAR(100) NOT NULL UNIQUE,
    tipo_mime VARCHAR(100) NOT NULL,
    tamano_bytes BIGINT UNSIGNED NOT NULL,
    fecha_creacion TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_incidencia_cuenta_evidencias_incidencia
        FOREIGN KEY (incidencia_id) REFERENCES incidencias_cuentas(id) ON DELETE CASCADE,
    INDEX idx_incidencia_cuenta_evidencias_fecha (incidencia_id, fecha_creacion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
