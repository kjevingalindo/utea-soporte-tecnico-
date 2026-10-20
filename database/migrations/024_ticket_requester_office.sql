ALTER TABLE tickets
    MODIFY COLUMN tipo_solicitante ENUM('estudiante', 'docente', 'administrativo', 'oficina') NULL;
