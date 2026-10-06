ALTER TABLE tickets
    ADD COLUMN fecha_programada DATE NULL,
    ADD INDEX idx_tickets_fecha_programada_estado (fecha_programada, estado);