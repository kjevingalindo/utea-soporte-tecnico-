ALTER TABLE tickets
    MODIFY COLUMN estado ENUM('Pendiente', 'Resuelto', 'Creado', 'Clasificado', 'Asignado', 'En proceso', 'Esperando usuario', 'Solucionado', 'Cerrado') NOT NULL DEFAULT 'Creado',
    MODIFY COLUMN prioridad ENUM('Baja', 'Media', 'Alta', 'Urgente', 'Critica') NOT NULL DEFAULT 'Media',
    ADD COLUMN sla_response_due_at BIGINT UNSIGNED NULL,
    ADD COLUMN sla_first_response_at BIGINT UNSIGNED NULL,
    ADD COLUMN sla_resolution_due_at BIGINT UNSIGNED NULL,
    ADD COLUMN sla_resolved_at BIGINT UNSIGNED NULL,
    ADD INDEX idx_tickets_sla_resolution_due (sla_resolution_due_at);

UPDATE tickets SET estado = 'Creado' WHERE estado = 'Pendiente';
UPDATE tickets SET estado = 'Solucionado' WHERE estado = 'Resuelto';

ALTER TABLE tickets
    MODIFY COLUMN estado ENUM('Creado', 'Clasificado', 'Asignado', 'En proceso', 'Esperando usuario', 'Solucionado', 'Cerrado') NOT NULL DEFAULT 'Creado';