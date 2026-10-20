(function exposeTicketForm(global) {
    const ENVIRONMENT_CATALOG = Object.freeze({
        'Salones / Aulas': ['AUL', 'AUL-PROYECTOR'],
        'Laboratorio de Agronomía y Ambiental': ['LAB', 'LAB-COMPUTADORAS'],
        Auditorio: ['AUL', 'AUL-AUDIO'],
        'Centro de Cómputo': ['LAB', 'LAB-COMPUTADORAS'],
        'Servicios Académicos': ['SAC', 'SAC-MATRICULAS'],
        Admisión: ['ADMIS', 'ADMIS-POSTULANTE'],
        'Grados y Títulos': ['GYT', 'GYT-EXPEDIENTES'],
        'Mesa de Partes': ['MDP', 'MDP-TRAMITE'],
        Administración: ['ADM', 'ADM-EQUIPOS'],
        'Subdirección de Derecho': ['SUB-DER', 'SUBDER-EQUIPOS'],
        'Subdirección de Agronomía, Ing. Ambiental e Ing. Civil': ['SUB-ING', 'SUBING-EQUIPOS'],
        'Subdirección de Contabilidad y Educación': ['SUB-CED', 'SUBCED-EQUIPOS'],
        'Subdirección de Enfermería': ['SUB-ENF', 'SUBENF-EQUIPOS'],
        Tópico: ['TOP', 'TOP-ATENCION'],
        'Sala de Docentes': ['SDOC', 'SDOC-EQUIPOS'],
        Biblioteca: ['BIB', 'BIB-EQUIPOS'],
        'Laboratorio de Ingeniería Civil': ['LAB', 'LAB-COMPUTADORAS'],
        Asistencia: ['ADM', 'ADM-ASISTENCIA']
    });

    function field(formData, name) {
        const value = formData.get(name);
        return typeof value === 'string' ? value.trim() : '';
    }

    function collect(formData) {
        const environment = field(formData, 'ambiente');
        const payload = {
            titulo: field(formData, 'titulo'),
            descripcion: field(formData, 'descripcion'),
            categoria_usuario: field(formData, 'categoria_usuario'),
            impacto: field(formData, 'impacto'),
            urgencia: field(formData, 'urgencia'),
            bloque: field(formData, 'bloque'),
            ambiente: environment,
            aula: field(formData, 'aula') || null,
            ubicacion: [field(formData, 'bloque'), environment, field(formData, 'aula') ? `Aula ${field(formData, 'aula')}` : '']
                .filter(Boolean).join(' - '),
            solicitante_nombre: field(formData, 'solicitante_nombre'),
            codigo_universitario_dni: field(formData, 'codigo_universitario_dni'),
            tipo_solicitante: field(formData, 'tipo_solicitante'),
            carrera: field(formData, 'carrera') || null,
            asignatura_area: field(formData, 'asignatura_area') || null,
            tecnico_id: field(formData, 'tecnico_id') || null
        };
        const catalog = ENVIRONMENT_CATALOG[environment];
        if (!catalog) throw new Error('Selecciona un ambiente válido.');
        if (!payload.titulo || !payload.descripcion || !payload.solicitante_nombre ||
            !payload.codigo_universitario_dni || !payload.tipo_solicitante ||
            !payload.categoria_usuario || !payload.bloque) {
            throw new Error('Completa los campos obligatorios del ticket.');
        }
        if (payload.tipo_solicitante === 'estudiante' && !payload.carrera) {
            throw new Error('Selecciona la carrera o programa del estudiante.');
        }
        if (payload.tipo_solicitante === 'docente' && (!payload.carrera || !payload.asignatura_area)) {
            throw new Error('Selecciona la carrera e indica la asignatura o área del docente.');
        }
        return { payload, officeCode: catalog[0], categoryCode: catalog[1] };
    }

    const OPERATION_KEY = 'utea.pending.ticket';
    const PAYLOAD_KEY = 'utea.pending.ticket.payload';
    const CREATED_TICKET_KEY = 'utea.pending.ticket.id';

    function readPendingOperation(storage) {
        const key = storage.getItem(OPERATION_KEY);
        if (!key) return null;
        const payloadText = storage.getItem(PAYLOAD_KEY);
        let payload = null;
        if (payloadText) {
            try {
                payload = JSON.parse(payloadText);
            } catch (error) {
                throw new Error('No se pudo recuperar el contenido de la solicitud pendiente.');
            }
        }
        const ticketId = Number(storage.getItem(CREATED_TICKET_KEY));
        return { key, payload, ticketId: Number.isSafeInteger(ticketId) && ticketId > 0 ? ticketId : null };
    }

    function clearPendingOperation(storage) {
        storage.removeItem(OPERATION_KEY);
        storage.removeItem(PAYLOAD_KEY);
        storage.removeItem(CREATED_TICKET_KEY);
    }

    function createSubmitHandler(form, dependencies) {
        let inFlight = false;

        async function finalize() {
            clearPendingOperation(dependencies.storage);
            form.reset();
            dependencies.synchronizeForm?.();
            dependencies.onComplete?.();
            dependencies.closeDialog?.();
        }

        async function attach(ticketId, file) {
            try {
                await dependencies.uploadEvidence(ticketId, file);
            } catch (error) {
                dependencies.onAttachmentFailure?.({
                    ticketId,
                    file,
                    error,
                    retry: () => attach(ticketId, file)
                });
                return;
            }
            await finalize();
            dependencies.onSuccess?.(`La evidencia del ticket #${ticketId} se adjuntó correctamente.`);
        }

        return async function handleSubmit(event) {
            event.preventDefault();
            if (inFlight) return;
            if (dependencies.hasSession && !dependencies.hasSession()) {
                dependencies.onError?.(new Error('Debe iniciar sesión para registrar un ticket.'));
                return;
            }
            let operation;
            try {
                operation = readPendingOperation(dependencies.storage);
            } catch (error) {
                dependencies.onError?.(error);
                return;
            }
            if (!operation?.ticketId && !form.reportValidity()) return;
            const button = form.querySelector('button[type="submit"]');
            inFlight = true;
            dependencies.setBusy?.(button, true);

            try {
                const evidence = form.querySelector('[name="fotoIncidencia"]')?.files?.[0];
                if (operation?.ticketId) {
                    if (!evidence) {
                        throw new Error(`El ticket #${operation.ticketId} ya fue creado. Selecciona la evidencia para reintentar el adjunto.`);
                    }
                    await attach(operation.ticketId, evidence);
                    return;
                }

                let payload = operation?.payload;
                let idempotencyKey = operation?.key;
                if (!payload) {
                    const collected = dependencies.collect
                        ? dependencies.collect(form)
                        : collect(new FormData(form));
                    const catalog = await dependencies.resolveCatalog(collected.officeCode, collected.categoryCode);
                    payload = { ...collected.payload, ...catalog };
                    idempotencyKey = idempotencyKey || dependencies.createIdempotencyKey();
                    dependencies.storage.setItem(OPERATION_KEY, idempotencyKey);
                    dependencies.storage.setItem(PAYLOAD_KEY, JSON.stringify(payload));
                }

                let result;
                try {
                    result = await dependencies.createTicket(payload, idempotencyKey);
                } catch (error) {
                    if (error.status >= 400 && error.status < 500 && error.status !== 409) {
                        clearPendingOperation(dependencies.storage);
                    }
                    throw error;
                }

                const ticketId = Number(result?.ticketId);
                if (!Number.isSafeInteger(ticketId) || ticketId < 1) {
                    throw new Error('El servidor no confirmó el identificador del ticket creado.');
                }
                dependencies.storage.setItem(CREATED_TICKET_KEY, String(ticketId));
                dependencies.onCreated?.(result);
                try {
                    await dependencies.refreshTickets?.();
                } catch (error) {
                    dependencies.onRefreshFailure?.(ticketId, error);
                }

                if (evidence) {
                    await attach(ticketId, evidence);
                    return;
                }

                await finalize();
                dependencies.onSuccess?.(result.mensaje || 'Ticket creado correctamente.');
            } catch (error) {
                dependencies.onError?.(error);
            } finally {
                inFlight = false;
                dependencies.setBusy?.(button, false);
            }
        };
    }

    function bindForm(form, dependencies = {}) {
        if (!form || form.dataset.ticketSubmitOwner) return null;
        form.dataset.ticketSubmitOwner = dependencies.owner || 'tickets';
        const handler = createSubmitHandler(form, dependencies);
        form.addEventListener('submit', handler);
        return handler;
    }

    const api = Object.freeze({
        collect,
        createSubmitHandler,
        bindForm,
        readPendingOperation,
        clearPendingOperation
    });
    global.UTEATicketForm = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
