ALTER TABLE tickets
    ADD COLUMN idempotency_key VARCHAR(128) NULL,
    ADD COLUMN idempotency_hash CHAR(64) NULL,
    ADD UNIQUE KEY uq_tickets_user_idempotency (user_id, idempotency_key);

ALTER TABLE incidencias_cuentas
    ADD COLUMN idempotency_key VARCHAR(128) NULL,
    ADD COLUMN idempotency_hash CHAR(64) NULL,
    ADD UNIQUE KEY uq_incidencias_user_idempotency (usuario_id, idempotency_key),
    -- Account incidents remain independent records; this nullable link is traceability only.
    -- Deleting a ticket detaches the reference and does not resolve/delete the incident.
    ADD CONSTRAINT fk_incidencias_cuentas_ticket
        FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE SET NULL;
