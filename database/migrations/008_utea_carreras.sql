ALTER TABLE tickets
    ADD COLUMN carrera VARCHAR(120) NULL AFTER categoria_id,
    ADD INDEX idx_tickets_carrera (carrera);
