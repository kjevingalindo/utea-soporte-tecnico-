ALTER TABLE tickets
    ADD COLUMN oficina_id INT NULL,
    ADD COLUMN categoria_id INT NULL,
    ADD COLUMN ubicacion VARCHAR(255) NULL,
    ADD COLUMN solicitante_nombre VARCHAR(150) NULL,
    ADD COLUMN codigo_universitario_dni VARCHAR(40) NULL,
    ADD COLUMN tipo_solicitante ENUM('estudiante', 'docente', 'administrativo') NULL,
    ADD INDEX idx_tickets_oficina_categoria (oficina_id, categoria_id),
    ADD CONSTRAINT fk_tickets_oficina FOREIGN KEY (oficina_id) REFERENCES oficinas(id) ON DELETE RESTRICT,
    ADD CONSTRAINT fk_tickets_categoria_oficina FOREIGN KEY (categoria_id, oficina_id)
        REFERENCES categorias(id, oficina_id) ON DELETE RESTRICT;