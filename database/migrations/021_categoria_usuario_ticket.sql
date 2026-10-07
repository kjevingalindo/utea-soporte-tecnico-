ALTER TABLE tickets
    ADD COLUMN categoria_usuario VARCHAR(80) NULL AFTER categoria_id,
    ADD INDEX idx_tickets_categoria_usuario (categoria_usuario);
