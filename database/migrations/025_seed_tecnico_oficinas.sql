-- 025_seed_tecnico_oficinas.sql
-- Asignacion explicita inicial de cobertura de soporte tecnico por oficina

INSERT IGNORE INTO tecnico_oficinas (tecnico_id, oficina_id, es_responsable)
SELECT t.id, o.id, 1
FROM tecnicos t
JOIN oficinas o ON o.codigo IN ('OTI', 'ADM', 'BIB', 'REG', 'LAB')
WHERE t.id = 1;
