ALTER TABLE usuarios
    ADD COLUMN nombre_completo VARCHAR(150) NULL,
    ADD COLUMN correo_institucional VARCHAR(254) NULL,
    ADD COLUMN oficina_id INT NULL,
    ADD UNIQUE INDEX uq_usuarios_correo_institucional (correo_institucional),
    ADD INDEX idx_usuarios_oficina (oficina_id),
    ADD CONSTRAINT fk_usuarios_oficina
        FOREIGN KEY (oficina_id) REFERENCES oficinas(id) ON DELETE SET NULL;