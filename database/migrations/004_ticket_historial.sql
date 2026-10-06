CREATE TABLE IF NOT EXISTS ticket_historial (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_id INT NOT NULL,
    usuario_id INT NULL,
    accion VARCHAR(50) NOT NULL,
    campo VARCHAR(50) NULL,
    valor_anterior TEXT NULL,
    valor_nuevo TEXT NULL,
    descripcion TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ticket_historial_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_ticket_historial_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
    INDEX idx_ticket_historial_ticket_fecha (ticket_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
