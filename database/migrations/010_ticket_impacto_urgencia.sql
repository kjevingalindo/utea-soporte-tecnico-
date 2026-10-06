ALTER TABLE tickets
    ADD COLUMN impacto ENUM('Bajo', 'Medio', 'Alto', 'Critico') NULL,
    ADD COLUMN urgencia ENUM('Baja', 'Media', 'Alta', 'Critica') NULL;