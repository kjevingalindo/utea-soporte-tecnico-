-- Migración 012: Ampliación de Roles, Encuestas de Satisfacción CSAT y Base de Conocimiento de Auto-Diagnóstico

ALTER TABLE usuarios 
    MODIFY COLUMN rol ENUM('superadmin', 'admin', 'tecnico', 'administrativo', 'estudiante', 'docente', 'usuario') NOT NULL DEFAULT 'usuario';

CREATE TABLE IF NOT EXISTS auto_diagnosticos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    categoria_codigo VARCHAR(50) NOT NULL,
    titulo VARCHAR(255) NOT NULL,
    problema_frecuente VARCHAR(255) NOT NULL,
    sintomas TEXT,
    pasos_diagnostico JSON NOT NULL,
    solucion_rapida TEXT NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_auto_diag_categoria (categoria_codigo, activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ticket_encuestas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_id INT NOT NULL UNIQUE,
    usuario_id INT NOT NULL,
    calificacion TINYINT NOT NULL CHECK (calificacion BETWEEN 1 AND 5),
    comentario TEXT NULL,
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_encuestas_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    CONSTRAINT fk_encuestas_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    INDEX idx_encuestas_calificacion (calificacion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed inicial de Auto-Diagnósticos para la Base de Conocimiento UTEA
INSERT IGNORE INTO auto_diagnosticos (categoria_codigo, titulo, problema_frecuente, sintomas, pasos_diagnostico, solucion_rapida) VALUES
('OTI-RED-SIN-INTERNET', 'Diagnóstico de Conexión a Internet Red UTEA', 'Sin internet en equipo de oficina o laboratorio', 'No abre páginas web, icono de red con signo de exclamación', 
 '["1. Verificar que el cable Ethernet esté firmemente conectado al puerto RJ-45 de la PC y de la roseta.", "2. Comprobar si las luces verde/amarilla del puerto de red parpadean.", "3. Abrir la terminal (cmd) y ejecutar ipconfig para verificar si se asignó IP en el rango 192.168.x.x o 10.x.x.x.", "4. Reiniciar el adaptador de red en Configuración > Red e Internet."]', 
 'Si la IP inicia en 169.254.x.x, reconecte el cable o reinicie el switch de la oficina. Si persiste, genere el ticket.'),

('OTI-HW-PC', 'Diagnóstico PC / Computadora no Enciende', 'El equipo no da señal de encendido ni luces', 'No giran ventiladores, la pantalla permanece negra, sin pitidos',
 '["1. Verificar el cable de energía conectado al estabilizador o supresor de picos.", "2. Asegurarse que el interruptor I/O en la parte trasera del case esté en posición I (encendido).", "3. Probar conectar un cargador o lámpara en el mismo tomacorriente para descarta falla de luz en la oficina.", "4. Mantener presionado el botón de encendido por 10 segundos y luego volver a presionar una vez."]',
 'Si el estabilizador no enciende luz roja/verde, cambie de tomacorriente. Si hay luces en la placa pero no da video, genere el ticket para revisión técnica.'),

('OTI-CORREO', 'Diagnóstico Acceso a Correo Institucional @utea.edu.pe', 'No puedo ingresar al correo institucional o contraseña rechazada', 'Error de contraseña o cuenta no encontrada al iniciar sesión en Gmail/Google Workspace',
 '["1. Asegurarse de incluir el dominio completo: usuario@utea.edu.pe.", "2. Comprobar que el teclado no tenga la tecla Bloq Mayús (Caps Lock) activa.", "3. Intentar iniciar sesión desde una ventana de incógnito del navegador para evitar conflicto de cookies.", "4. En caso de olvido de clave, utilizar la opción de recuperación SMS/correo alternativo."]',
 'Si su cuenta está suspendida por inactividad o requiere restablecimiento manual de credenciales por la OTI, continúe con el envío del ticket.'),

('OTI-PLATAFORMA-VIRTUAL', 'Diagnóstico Aula Virtual UTEA / Moodle', 'Cursos no visibles o error al cargar el Aula Virtual', 'Mensaje de error 500/404 o credenciales no válidas en la plataforma de aprendizaje',
 '["1. Verificar si la matricula del semestre actual está regularizada en Registros Académicos.", "2. Borrar la memoria caché y cookies de su navegador habitual.", "3. Probar el ingreso desde un navegador alternativo (Firefox / Chrome / Edge).", "4. Verificar que su perfil de estudiante/docente esté activo en la sede Andahuaylas."]',
 'Los cursos matriculados tardan hasta 24 horas en sincronizarse automáticamente. Si transcurrió más de un día, reporte el ticket adjuntando su ficha de matrícula.'),

('OTI-HW-IMPRESORA', 'Diagnóstico Impresora / Fotocopiadora Institucional', 'Impresora en estado Desconectado o atasco de papel', 'Documentos en cola sin imprimir, luz roja intermitente',
 '["1. Verificar que la impresora esté encendida y conectada a la PC o red LAN.", "2. Inspeccionar si la bandeja de papel tiene hojas y si la tapa frontal está bien cerrada.", "3. Abrir la cola de impresión y cancelar todos los documentos pausados.", "4. Reiniciar la cola de servicios de impresión de Windows (spooler)."]',
 'Si hay un atasco físico de papel o falta de tóner en la oficina, solicite intervención del técnico asignado mediante este ticket.');
