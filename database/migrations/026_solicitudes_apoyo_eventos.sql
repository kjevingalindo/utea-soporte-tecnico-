-- Migración 026: Solicitudes de Apoyo Técnico para Eventos y Ambientes
-- UTEA Sede Andahuaylas

CREATE TABLE IF NOT EXISTS solicitudes_apoyo (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(50) NOT NULL UNIQUE,
    user_id INT NOT NULL,
    solicitante_contacto VARCHAR(255) NOT NULL,
    area_organizadora VARCHAR(255) NOT NULL,
    responsable_evento VARCHAR(255) NOT NULL,
    nombre_actividad VARCHAR(255) NOT NULL,
    descripcion TEXT NOT NULL,
    bloque VARCHAR(100) NOT NULL,
    ambiente VARCHAR(180) NOT NULL,
    fecha_evento DATE NOT NULL,
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    hora_preparacion TIME NOT NULL,
    apoyos_requeridos JSON NOT NULL,
    equipos_recursos TEXT NULL,
    observaciones TEXT NULL,
    archivo_autorizacion VARCHAR(255) NOT NULL,
    archivo_autorizacion_nombre VARCHAR(255) NOT NULL,
    archivo_autorizacion_mime VARCHAR(100) NOT NULL,
    archivo_autorizacion_size INT NOT NULL,
    estado ENUM('Recibida', 'En revision', 'Observada', 'Aprobada', 'Programada', 'En atencion', 'Finalizada', 'Rechazada', 'Cancelada', 'Impedida') NOT NULL DEFAULT 'Recibida',
    motivo_observacion TEXT NULL,
    subsanacion_solicitante TEXT NULL,
    motivo_rechazo TEXT NULL,
    motivo_cancelacion TEXT NULL,
    tecnico_id INT NULL,
    recepcion_confirmada BOOLEAN NOT NULL DEFAULT FALSE,
    fecha_recepcion_confirmada DATETIME NULL,
    llegada_registrada_at DATETIME NULL,
    llegada_usuario_id INT NULL,
    finalizacion_at DATETIME NULL,
    trabajo_realizado TEXT NULL,
    observaciones_cierre TEXT NULL,
    archivo_evidencia_cierre VARCHAR(255) NULL,
    impedimento_at DATETIME NULL,
    motivo_impedimento TEXT NULL,
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_apoyos_usuario FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    CONSTRAINT fk_apoyos_tecnico FOREIGN KEY (tecnico_id) REFERENCES tecnicos(id) ON DELETE SET NULL,
    CONSTRAINT fk_apoyos_llegada_usuario FOREIGN KEY (llegada_usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
    INDEX idx_apoyos_fecha_ambiente (fecha_evento, bloque, ambiente),
    INDEX idx_apoyos_tecnico_fecha (tecnico_id, fecha_evento),
    INDEX idx_apoyos_estado (estado),
    INDEX idx_apoyos_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS apoyo_historial (
    id INT AUTO_INCREMENT PRIMARY KEY,
    apoyo_id INT NOT NULL,
    usuario_id INT NOT NULL,
    accion VARCHAR(50) NOT NULL,
    estado_anterior VARCHAR(50) NULL,
    estado_nuevo VARCHAR(50) NULL,
    detalles TEXT NULL,
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_apoyo_historial_apoyo FOREIGN KEY (apoyo_id) REFERENCES solicitudes_apoyo(id) ON DELETE CASCADE,
    CONSTRAINT fk_apoyo_historial_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    INDEX idx_historial_apoyo_fecha (apoyo_id, creado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS apoyo_recordatorios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    apoyo_id INT NOT NULL,
    usuario_id INT NOT NULL,
    tipo_aviso ENUM('24h', '1h', '15m') NOT NULL,
    fecha_programada_aviso DATETIME NOT NULL,
    estado ENUM('pendiente', 'enviado', 'cancelado') NOT NULL DEFAULT 'pendiente',
    enviado_at DATETIME NULL,
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_recordatorios_apoyo FOREIGN KEY (apoyo_id) REFERENCES solicitudes_apoyo(id) ON DELETE CASCADE,
    CONSTRAINT fk_recordatorios_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    INDEX idx_recordatorios_pendientes (estado, fecha_programada_aviso),
    INDEX idx_recordatorios_apoyo (apoyo_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Agregar columnas de soporte para apoyos en notificaciones si no existen
SET @col_apoyo_id = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notificaciones' AND COLUMN_NAME = 'apoyo_id');
SET @alter_apoyo_id = IF(@col_apoyo_id = 0, 'ALTER TABLE notificaciones ADD COLUMN apoyo_id INT NULL, ADD CONSTRAINT fk_notificaciones_apoyo FOREIGN KEY (apoyo_id) REFERENCES solicitudes_apoyo(id) ON DELETE CASCADE', 'SELECT 1');
PREPARE stmt_apoyo_id FROM @alter_apoyo_id;
EXECUTE stmt_apoyo_id;
DEALLOCATE PREPARE stmt_apoyo_id;

SET @col_ref_tipo = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'notificaciones' AND COLUMN_NAME = 'referencia_tipo');
SET @alter_ref_tipo = IF(@col_ref_tipo = 0, 'ALTER TABLE notificaciones ADD COLUMN referencia_tipo VARCHAR(20) NOT NULL DEFAULT "ticket"', 'SELECT 1');
PREPARE stmt_ref_tipo FROM @alter_ref_tipo;
EXECUTE stmt_ref_tipo;
DEALLOCATE PREPARE stmt_ref_tipo;

