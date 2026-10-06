CREATE TABLE IF NOT EXISTS ticket_adjuntos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_id INT NOT NULL,
    usuario_id INT NULL,
    nombre_original VARCHAR(255) NOT NULL,
    nombre_archivo VARCHAR(100) NOT NULL UNIQUE,
    tipo_mime VARCHAR(100) NOT NULL,
    tamano_bytes BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ticket_adjuntos_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_ticket_adjuntos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
    INDEX idx_ticket_adjuntos_ticket_fecha (ticket_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;