(function exposeApoyosModule(global) {
    'use strict';

    const AMBIENTES_POR_BLOQUE = {
        'Bloque A': [
            'Salones / Aulas',
            'Laboratorio de Agronomía y Ambiental',
            'Auditorio',
            'Centro de Cómputo'
        ],
        'Bloque B': [
            'Servicios Académicos',
            'Admisión',
            'Grados y Títulos',
            'Mesa de Partes',
            'Administración',
            'Subdirección de Derecho',
            'Subdirección de Agronomía, Ing. Ambiental e Ing. Civil',
            'Subdirección de Contabilidad y Educación',
            'Subdirección de Enfermería',
            'Tópico'
        ],
        'Bloque C': [
            'Sala de Docentes',
            'Salones / Aulas',
            'Biblioteca',
            'Laboratorio de Ingeniería Civil'
        ],
        'Bloque de Asistencia': [
            'Asistencia'
        ]
    };

    const LABELS_TIPO_APOYO = {
        proyector: 'Proyector multimedia y ecran',
        laptop: 'Laptop / equipo de cómputo',
        sonido: 'Equipo de sonido y amplificación',
        microfonos: 'Micrófonos inalámbricos / alámbricos',
        internet: 'Conexión a internet dedicada / WiFi',
        iluminacion: 'Iluminación y reflectores',
        grabacion: 'Grabación de video / streaming',
        asistencia_permanente: 'Asistencia técnica permanente durante el evento'
    };

    function escapeHtml(val) {
        return String(val ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getAuthToken() {
        return localStorage.getItem('token');
    }

    function authHeaders(isJson = true) {
        const headers = {
            'Authorization': `Bearer ${getAuthToken()}`
        };
        if (isJson) headers['Content-Type'] = 'application/json';
        return headers;
    }

    function badgeEstadoApoyo(estado, atencionNoRegistrada = false) {
        if (atencionNoRegistrada) {
            return `<span class="badge" style="background:#fee2e2; color:#b91c1c; font-weight:600; padding:3px 8px; border-radius:12px; font-size:0.75rem;"><i class="ph ph-clock-countdown"></i> Atención pendiente de registrar</span>`;
        }
        const estilos = {
            'Recibida': 'background:#f1f5f9; color:#475569;',
            'En revision': 'background:#e0f2fe; color:#0369a1;',
            'Observada': 'background:#fef3c7; color:#b45309;',
            'Aprobada': 'background:#dcfce7; color:#15803d;',
            'Programada': 'background:#ede9fe; color:#6d28d9;',
            'En atencion': 'background:#dbeafe; color:#1d4ed8;',
            'Finalizada': 'background:#d1fae5; color:#047857;',
            'Rechazada': 'background:#fee2e2; color:#b91c1c;',
            'Cancelada': 'background:#f3f4f6; color:#6b7280;',
            'Impedida': 'background:#ffe4e6; color:#be123c;'
        };
        const style = estilos[estado] || 'background:#f1f5f9; color:#475569;';
        return `<span class="badge" style="${style} font-weight:600; padding:3px 8px; border-radius:12px; font-size:0.75rem;">${escapeHtml(estado)}</span>`;
    }

    // Inicialización del catálogo de bloques y ambientes en el formulario
    function inicializarCatalogoAmbientes(selectBloqueId, selectAmbienteId) {
        const selBloque = document.getElementById(selectBloqueId);
        const selAmbiente = document.getElementById(selectAmbienteId);
        if (!selBloque || !selAmbiente) return;

        selBloque.innerHTML = '<option value="">-- Seleccionar bloque --</option>' +
            Object.keys(AMBIENTES_POR_BLOQUE).map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('');

        selBloque.addEventListener('change', () => {
            const bloque = selBloque.value;
            const ambientes = AMBIENTES_POR_BLOQUE[bloque] || [];
            selAmbiente.innerHTML = '<option value="">-- Seleccionar ambiente --</option>' +
                ambientes.map(a => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join('');
            selAmbiente.disabled = ambientes.length === 0;
            verificarConflictosFormulario();
        });

        selAmbiente.addEventListener('change', verificarConflictosFormulario);
    }

    // Comprobación de cruces de horario en tiempo real para el formulario de solicitud
    async function verificarConflictosFormulario() {
        const fecha = document.getElementById('apoyoFechaEvento')?.value;
        const horaPrep = document.getElementById('apoyoHoraPrep')?.value;
        const horaFin = document.getElementById('apoyoHoraFin')?.value;
        const bloque = document.getElementById('apoyoBloque')?.value;
        const ambiente = document.getElementById('apoyoAmbiente')?.value;
        const alertBox = document.getElementById('solicitudConflictoAlert');

        if (!alertBox) return;

        if (!fecha || !horaPrep || !horaFin || !bloque || !ambiente) {
            alertBox.style.display = 'none';
            return;
        }

        try {
            const query = new URLSearchParams({
                fecha_evento: fecha,
                hora_preparacion: horaPrep,
                hora_fin: horaFin,
                bloque,
                ambiente
            });
            const res = await fetch(`/api/apoyos/conflictos?${query}`, {
                headers: authHeaders()
            });
            const data = await res.json();
            if (data.hasConflict) {
                alertBox.innerHTML = `<strong><i class="ph ph-warning"></i> Cruce de horario detectado:</strong><br>${data.conflicts.map(c => escapeHtml(c.mensaje)).join('<br>')}`;
                alertBox.style.display = 'block';
            } else {
                alertBox.style.display = 'none';
            }
        } catch (_) {
            alertBox.style.display = 'none';
        }
    }

    // Comprobación de cruces de horario para el modal de programación admin
    async function verificarConflictosProgramacion() {
        const id = document.getElementById('adminProgramarApoyoId')?.value;
        const fecha = document.getElementById('adminProgramarFecha')?.value;
        const horaPrep = document.getElementById('adminProgramarPrep')?.value;
        const horaFin = document.getElementById('adminProgramarFin')?.value;
        const techId = document.getElementById('adminProgramarTecnico')?.value;
        const bloque = document.getElementById('adminProgramarBloque')?.value;
        const ambiente = document.getElementById('adminProgramarAmbiente')?.value;
        const alertBox = document.getElementById('adminProgramarConflictoAlert');

        if (!alertBox) return;

        if (!fecha || !horaPrep || !horaFin || !bloque || !ambiente) {
            alertBox.style.display = 'none';
            return;
        }

        try {
            const query = new URLSearchParams({
                apoyo_id: id || '',
                fecha_evento: fecha,
                hora_preparacion: horaPrep,
                hora_fin: horaFin,
                bloque,
                ambiente,
                tecnico_id: techId || ''
            });
            const res = await fetch(`/api/apoyos/conflictos?${query}`, {
                headers: authHeaders()
            });
            const data = await res.json();
            if (data.hasConflict) {
                alertBox.innerHTML = `<strong><i class="ph ph-warning"></i> Cruce de horario:</strong><br>${data.conflicts.map(c => escapeHtml(c.mensaje)).join('<br>')}`;
                alertBox.style.display = 'block';
            } else {
                alertBox.style.display = 'none';
            }
        } catch (_) {
            alertBox.style.display = 'none';
        }
    }

    // Modal de solicitud de apoyo
    function abrirModalSolicitudApoyo() {
        inicializarCatalogoAmbientes('apoyoBloque', 'apoyoAmbiente');
        const modal = document.getElementById('modalSolicitudApoyo');
        const overlay = document.getElementById('modalSolicitudApoyoOverlay');
        const form = document.getElementById('formSolicitudApoyo');
        if (form) form.reset();
        const alertBox = document.getElementById('solicitudConflictoAlert');
        if (alertBox) alertBox.style.display = 'none';

        if (modal) modal.style.display = 'block';
        if (overlay) overlay.style.display = 'block';

        const user = window.currentUser || {};
        const contactoInput = document.getElementById('apoyoContacto');
        if (contactoInput && !contactoInput.value) {
            contactoInput.value = user.correo_institucional || user.username || '';
        }
    }

    function cerrarModalSolicitudApoyo() {
        const modal = document.getElementById('modalSolicitudApoyo');
        const overlay = document.getElementById('modalSolicitudApoyoOverlay');
        if (modal) modal.style.display = 'none';
        if (overlay) overlay.style.display = 'none';
    }

    // Envío del formulario de solicitud
    async function enviarSolicitudApoyo(e) {
        e.preventDefault();
        const form = e.target;
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn ? submitBtn.innerHTML : 'Enviar solicitud';

        const horaPrep = document.getElementById('apoyoHoraPrep')?.value;
        const horaInicio = document.getElementById('apoyoHoraInicio')?.value;
        const horaFin = document.getElementById('apoyoHoraFin')?.value;

        if (horaPrep >= horaInicio) {
            window.mostrarMensaje?.('La hora de preparación debe ser anterior a la hora de inicio del evento.', 'error');
            return;
        }
        if (horaInicio >= horaFin) {
            window.mostrarMensaje?.('La hora de inicio debe ser anterior a la hora de fin del evento.', 'error');
            return;
        }

        // Obtener apoyos seleccionados
        const checkboxes = form.querySelectorAll('input[name="apoyos_requeridos"]:checked');
        if (checkboxes.length === 0) {
            window.mostrarMensaje?.('Debe seleccionar al menos un tipo de apoyo técnico requerido.', 'error');
            return;
        }
        const apoyosList = Array.from(checkboxes).map(cb => cb.value);

        const formData = new FormData(form);
        formData.set('apoyos_requeridos', JSON.stringify(apoyosList));

        const fileInput = document.getElementById('apoyoArchivo');
        if (!fileInput || !fileInput.files || !fileInput.files.length) {
            window.mostrarMensaje?.('El documento de autorización en PDF, JPG o PNG es obligatorio.', 'error');
            return;
        }

        try {
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="ph ph-spinner"></i> Enviando...';
            }

            const res = await fetch('/api/apoyos', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${getAuthToken()}`
                },
                body: formData
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || 'No se pudo registrar la solicitud de apoyo.');
            }

            window.mostrarMensaje?.(`Solicitud registrada con éxito: ${data.solicitud?.codigo || ''}`, 'success');
            cerrarModalSolicitudApoyo();
            cargarMisSolicitudesApoyo();
            if (window.currentUser?.rol === 'admin' || window.currentUser?.rol === 'superadmin') {
                cargarApoyosAdmin();
            }
        } catch (err) {
            window.mostrarMensaje?.(err.message, 'error');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;
            }
        }
    }

    // Cargar solicitudes propias del solicitante (en Mis Tickets > pestaña Apoyos)
    async function cargarMisSolicitudesApoyo() {
        const container = document.getElementById('misApoyosLista');
        const badgeCount = document.getElementById('count-mis-apoyos');
        if (!container) return;

        try {
            container.innerHTML = '<p class="text-muted" style="padding:16px;">Cargando solicitudes de apoyo...</p>';
            const res = await fetch('/api/apoyos?vista=mis_solicitudes', {
                headers: authHeaders()
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al consultar apoyos');

            if (badgeCount) badgeCount.textContent = data.length;

            if (data.length === 0) {
                container.innerHTML = `
                    <div style="text-align:center; padding:32px; color:var(--text-secondary);">
                        <i class="ph ph-calendar-blank" style="font-size:2.5rem; opacity:0.5; display:block; margin-bottom:8px;"></i>
                        <p style="margin:0; font-weight:500;">No tienes solicitudes de apoyo técnico para eventos registradas.</p>
                        <button type="button" class="btn-primary btn-small" onclick="window.ApoyosModule.abrirModalSolicitudApoyo()" style="margin-top:12px;">
                            <i class="ph ph-plus"></i> Solicitar apoyo ahora
                        </button>
                    </div>
                `;
                return;
            }

            container.innerHTML = data.map(apoyo => {
                const fecha = apoyo.fecha_evento ? String(apoyo.fecha_evento).slice(0, 10) : '—';
                const prep = apoyo.hora_preparacion ? apoyo.hora_preparacion.slice(0, 5) : '—';
                const inicio = apoyo.hora_inicio ? apoyo.hora_inicio.slice(0, 5) : '—';
                const fin = apoyo.hora_fin ? apoyo.hora_fin.slice(0, 5) : '—';
                const apoyosTxt = (apoyo.apoyos_requeridos || []).map(t => LABELS_TIPO_APOYO[t] || t).join(', ');

                return `
                    <div class="apoyo-card-item" style="border:1px solid var(--border-color); border-radius:8px; padding:16px; margin-bottom:12px; background:var(--bg-main);">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
                            <div>
                                <span style="font-weight:700; color:var(--primary-color);">${escapeHtml(apoyo.codigo)}</span>
                                <h4 style="margin:4px 0 6px 0; font-size:1.05rem;">${escapeHtml(apoyo.nombre_actividad)}</h4>
                                <div style="font-size:0.85rem; color:var(--text-secondary); display:flex; gap:16px; flex-wrap:wrap;">
                                    <span><i class="ph ph-map-pin"></i> ${escapeHtml(apoyo.bloque)} - ${escapeHtml(apoyo.ambiente)}</span>
                                    <span><i class="ph ph-calendar"></i> ${escapeHtml(fecha)}</span>
                                    <span><i class="ph ph-clock"></i> Prep: ${prep} | Evento: ${inicio} a ${fin}</span>
                                    ${apoyo.tecnico_nombre ? `<span><i class="ph ph-user"></i> Técnico: ${escapeHtml(apoyo.tecnico_nombre)}</span>` : ''}
                                </div>
                                <div style="margin-top:6px; font-size:0.83rem; color:var(--text-primary);">
                                    <strong>Requerimientos:</strong> ${escapeHtml(apoyosTxt || 'Ninguno especificado')}
                                </div>
                                ${apoyo.motivo_observacion && apoyo.estado === 'Observada' ? `
                                    <div style="margin-top:8px; padding:8px 12px; background:#fef3c7; border-left:4px solid #f59e0b; border-radius:4px; font-size:0.85rem; color:#92400e;">
                                        <strong><i class="ph ph-warning-circle"></i> Observación de la OTI:</strong> ${escapeHtml(apoyo.motivo_observacion)}
                                    </div>
                                ` : ''}
                            </div>
                            <div style="display:flex; flex-direction:column; align-items:flex-end; gap:8px;">
                                ${badgeEstadoApoyo(apoyo.estado, apoyo.atencion_no_registrada)}
                                <div style="display:flex; gap:6px; margin-top:8px;">
                                    ${apoyo.estado === 'Observada' ? `
                                        <button type="button" class="btn-primary btn-small" onclick="window.ApoyosModule.abrirModalSubsanar(${apoyo.id})" style="background:#d97706;">
                                            <i class="ph ph-pencil-simple"></i> Subsanar
                                        </button>
                                    ` : ''}
                                    <button type="button" class="btn-secondary btn-small" onclick="window.ApoyosModule.verDetalleApoyo(${apoyo.id})">
                                        <i class="ph ph-eye"></i> Detalle
                                    </button>
                                    <a href="/api/apoyos/${apoyo.id}/autorizacion" target="_blank" class="btn-secondary btn-small" title="Descargar autorización">
                                        <i class="ph ph-file-arrow-down"></i> Autorización
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (err) {
            container.innerHTML = `<p class="text-danger" style="padding:16px;">Error cargando solicitudes: ${escapeHtml(err.message)}</p>`;
        }
    }

    // Modal para que el solicitante subsane observaciones
    function abrirModalSubsanar(apoyoId) {
        document.getElementById('subsanarApoyoId').value = apoyoId;
        document.getElementById('subsanarDetalle').value = '';
        document.getElementById('subsanarArchivo').value = '';
        const modal = document.getElementById('modalSubsanarApoyo');
        const overlay = document.getElementById('modalSubsanarApoyoOverlay');
        if (modal) modal.style.display = 'block';
        if (overlay) overlay.style.display = 'block';
    }

    function cerrarModalSubsanar() {
        const modal = document.getElementById('modalSubsanarApoyo');
        const overlay = document.getElementById('modalSubsanarApoyoOverlay');
        if (modal) modal.style.display = 'none';
        if (overlay) overlay.style.display = 'none';
    }

    async function enviarSubsanacion(e) {
        e.preventDefault();
        const form = e.target;
        const id = document.getElementById('subsanarApoyoId').value;
        const formData = new FormData(form);

        try {
            const res = await fetch(`/api/apoyos/${id}/subsanar`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${getAuthToken()}`
                },
                body: formData
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al enviar subsanación');

            window.mostrarMensaje?.('Subsanación enviada exitosamente. Estado actualizado a "En revisión".', 'success');
            cerrarModalSubsanar();
            cargarMisSolicitudesApoyo();
            if (window.currentUser?.rol === 'admin' || window.currentUser?.rol === 'superadmin') {
                cargarApoyosAdmin();
            }
        } catch (err) {
            window.mostrarMensaje?.(err.message, 'error');
        }
    }

    // Cargar vista de administración de apoyos
    async function cargarApoyosAdmin() {
        const tbody = document.getElementById('adminApoyosTableBody');
        const estadoFilter = document.getElementById('adminApoyosFiltroEstado')?.value || '';
        if (!tbody) return;

        try {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:24px;">Cargando solicitudes...</td></tr>';

            // Actualizar métricas top
            cargarEstadisticasApoyosAdmin();

            const query = new URLSearchParams();
            if (estadoFilter) query.set('estado', estadoFilter);

            const res = await fetch(`/api/apoyos?${query}`, {
                headers: authHeaders()
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error cargando solicitudes de apoyo');

            if (data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:24px; color:var(--text-secondary);">No se encontraron solicitudes de apoyo.</td></tr>';
                return;
            }

            tbody.innerHTML = data.map(a => {
                const fecha = a.fecha_evento ? String(a.fecha_evento).slice(0, 10) : '—';
                const prep = a.hora_preparacion ? a.hora_preparacion.slice(0, 5) : '—';
                const fin = a.hora_fin ? a.hora_fin.slice(0, 5) : '—';

                return `
                    <tr>
                        <td><strong>${escapeHtml(a.codigo)}</strong></td>
                        <td>
                            <strong>${escapeHtml(a.nombre_actividad)}</strong><br>
                            <span style="font-size:0.75rem; color:var(--text-secondary);">${escapeHtml(a.area_organizadora)}</span>
                        </td>
                        <td>
                            <span>${escapeHtml(a.bloque)}</span><br>
                            <span style="font-size:0.8rem; font-weight:600;">${escapeHtml(a.ambiente)}</span>
                        </td>
                        <td>
                            <span>${escapeHtml(fecha)}</span><br>
                            <span style="font-size:0.78rem; color:var(--text-secondary);">${prep} a ${fin}</span>
                        </td>
                        <td>${escapeHtml(a.tecnico_nombre || 'Sin asignar')}</td>
                        <td>${badgeEstadoApoyo(a.estado, a.atencion_no_registrada)}</td>
                        <td style="white-space:nowrap;">
                            <button type="button" class="btn-secondary btn-small" onclick="window.ApoyosModule.verDetalleApoyo(${a.id})" title="Ver detalle">
                                <i class="ph ph-eye"></i>
                            </button>
                            <a href="/api/apoyos/${a.id}/autorizacion" target="_blank" class="btn-secondary btn-small" title="Descargar autorización">
                                <i class="ph ph-file-arrow-down"></i>
                            </a>
                            ${['Recibida', 'En revision', 'Observada'].includes(a.estado) ? `
                                <button type="button" class="btn-secondary btn-small" onclick="window.ApoyosModule.aprobarApoyoAdmin(${a.id})" title="Aprobar" style="color:#16a34a;">
                                    <i class="ph ph-check-circle"></i>
                                </button>
                                <button type="button" class="btn-secondary btn-small" onclick="window.ApoyosModule.abrirModalObservarAdmin(${a.id})" title="Observar" style="color:#d97706;">
                                    <i class="ph ph-warning-circle"></i>
                                </button>
                                <button type="button" class="btn-secondary btn-small" onclick="window.ApoyosModule.abrirModalRechazarAdmin(${a.id})" title="Rechazar" style="color:#dc2626;">
                                    <i class="ph ph-x-circle"></i>
                                </button>
                            ` : ''}
                            ${['Recibida', 'En revision', 'Aprobada', 'Programada'].includes(a.estado) ? `
                                <button type="button" class="btn-primary btn-small" onclick="window.ApoyosModule.abrirModalProgramar(${a.id})" title="Programar / Reprogramar">
                                    <i class="ph ph-calendar-plus"></i> ${a.estado === 'Programada' ? 'Reprogramar' : 'Programar'}
                                </button>
                            ` : ''}
                        </td>
                    </tr>
                `;
            }).join('');
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:24px; color:#dc2626;">${escapeHtml(err.message)}</td></tr>`;
        }
    }

    async function cargarEstadisticasApoyosAdmin() {
        try {
            const res = await fetch('/api/apoyos/estadisticas', {
                headers: authHeaders()
            });
            const data = await res.json();
            if (!res.ok) return;

            const elSol = document.getElementById('statApoyoSol');
            const elProg = document.getElementById('statApoyoProg');
            const elFin = document.getElementById('statApoyoFin');
            const elPend = document.getElementById('statApoyoPendReg');

            if (elSol) elSol.textContent = data.solicitados || 0;
            if (elProg) elProg.textContent = data.programados || 0;
            if (elFin) elFin.textContent = data.finalizados || 0;
            if (elPend) elPend.textContent = data.atencionPendienteRegistrar || 0;
        } catch (_) {}
    }

    // Modal Programar / Reprogramar Apoyo (Admin)
    async function abrirModalProgramar(apoyoId) {
        try {
            const res = await fetch(`/api/apoyos/${apoyoId}`, { headers: authHeaders() });
            const apoyo = await res.json();
            if (!res.ok) throw new Error(apoyo.error || 'Error al cargar apoyo');

            document.getElementById('adminProgramarApoyoId').value = apoyo.id;
            document.getElementById('adminProgramarBloque').value = apoyo.bloque;
            document.getElementById('adminProgramarAmbiente').value = apoyo.ambiente;
            document.getElementById('adminProgramarActividadLabel').textContent = `${apoyo.codigo} - ${apoyo.nombre_actividad}`;
            document.getElementById('adminProgramarAmbienteLabel').textContent = `${apoyo.bloque} / ${apoyo.ambiente}`;
            document.getElementById('adminProgramarFecha').value = apoyo.fecha_evento ? String(apoyo.fecha_evento).slice(0, 10) : '';
            document.getElementById('adminProgramarPrep').value = apoyo.hora_preparacion ? apoyo.hora_preparacion.slice(0, 5) : '';
            document.getElementById('adminProgramarInicio').value = apoyo.hora_inicio ? apoyo.hora_inicio.slice(0, 5) : '';
            document.getElementById('adminProgramarFin').value = apoyo.hora_fin ? apoyo.hora_fin.slice(0, 5) : '';

            // Cargar select de técnicos
            const techRes = await fetch('/api/tecnicos', { headers: authHeaders() });
            const tecnicos = await techRes.json();
            const techSelect = document.getElementById('adminProgramarTecnico');
            if (techSelect) {
                techSelect.innerHTML = '<option value="">-- Seleccionar técnico responsable --</option>' +
                    tecnicos.map(t => `<option value="${t.id}" ${t.id == apoyo.tecnico_id ? 'selected' : ''}>${escapeHtml(t.nombre)}${t.es_jefe ? ' (Jefe)' : ''}</option>`).join('');
            }

            const alertBox = document.getElementById('adminProgramarConflictoAlert');
            if (alertBox) alertBox.style.display = 'none';

            const modal = document.getElementById('modalProgramarApoyo');
            const overlay = document.getElementById('modalProgramarApoyoOverlay');
            if (modal) modal.style.display = 'block';
            if (overlay) overlay.style.display = 'block';

            verificarConflictosProgramacion();
        } catch (err) {
            window.mostrarMensaje?.(err.message, 'error');
        }
    }

    function cerrarModalProgramar() {
        const modal = document.getElementById('modalProgramarApoyo');
        const overlay = document.getElementById('modalProgramarApoyoOverlay');
        if (modal) modal.style.display = 'none';
        if (overlay) overlay.style.display = 'none';
    }

    async function guardarProgramacionApoyo(e) {
        e.preventDefault();
        const id = document.getElementById('adminProgramarApoyoId').value;
        const fecha = document.getElementById('adminProgramarFecha').value;
        const horaPrep = document.getElementById('adminProgramarPrep').value;
        const horaInicio = document.getElementById('adminProgramarInicio').value;
        const horaFin = document.getElementById('adminProgramarFin').value;
        const techId = document.getElementById('adminProgramarTecnico').value;

        if (horaPrep >= horaInicio) {
            window.mostrarMensaje?.('La hora de preparación debe ser anterior al inicio del evento.', 'error');
            return;
        }
        if (horaInicio >= horaFin) {
            window.mostrarMensaje?.('La hora de inicio debe ser anterior a la hora de fin.', 'error');
            return;
        }
        if (!techId) {
            window.mostrarMensaje?.('Debe asignar un técnico responsable para programar el apoyo.', 'error');
            return;
        }

        try {
            const res = await fetch(`/api/apoyos/${id}/programar`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    fecha_evento: fecha,
                    hora_preparacion: horaPrep,
                    hora_inicio: horaInicio,
                    hora_fin: horaFin,
                    tecnico_id: techId
                })
            });
            const data = await res.json();
            if (!res.ok) {
                if (data.conflictos && data.conflictos.length) {
                    const msg = data.conflictos.map(c => c.mensaje).join('\n');
                    throw new Error(`Cruce de horario:\n${msg}`);
                }
                throw new Error(data.error || 'Error al programar el apoyo');
            }

            window.mostrarMensaje?.('Apoyo programado exitosamente con recordatorios configurados.', 'success');
            cerrarModalProgramar();
            cargarApoyosAdmin();
        } catch (err) {
            window.mostrarMensaje?.(err.message, 'error');
        }
    }

    // Aprobación directa por Admin
    async function aprobarApoyoAdmin(apoyoId) {
        if (!confirm('¿Confirmas la aprobación de esta solicitud de apoyo técnico?')) return;
        try {
            const res = await fetch(`/api/apoyos/${apoyoId}/aprobar`, {
                method: 'POST',
                headers: authHeaders()
            });
            const data = await res.json();
            if (!res.ok) {
                if (data.conflictos && data.conflictos.length) {
                    const msg = data.conflictos.map(c => c.mensaje).join('\n');
                    throw new Error(`Conflicto de horario:\n${msg}`);
                }
                throw new Error(data.error || 'No se pudo aprobar la solicitud');
            }

            window.mostrarMensaje?.('Solicitud aprobada exitosamente. Asigna ahora el técnico responsable.', 'success');
            cargarApoyosAdmin();
            abrirModalProgramar(apoyoId);
        } catch (err) {
            window.mostrarMensaje?.(err.message, 'error');
        }
    }

    // Modal Observar (Admin)
    function abrirModalObservarAdmin(apoyoId) {
        document.getElementById('observarApoyoId').value = apoyoId;
        document.getElementById('observarMotivo').value = '';
        const modal = document.getElementById('modalObservarApoyo');
        const overlay = document.getElementById('modalObservarApoyoOverlay');
        if (modal) modal.style.display = 'block';
        if (overlay) overlay.style.display = 'block';
    }

    function cerrarModalObservarAdmin() {
        const modal = document.getElementById('modalObservarApoyo');
        const overlay = document.getElementById('modalObservarApoyoOverlay');
        if (modal) modal.style.display = 'none';
        if (overlay) overlay.style.display = 'none';
    }

    async function enviarObservacionAdmin(e) {
        e.preventDefault();
        const id = document.getElementById('observarApoyoId').value;
        const motivo = document.getElementById('observarMotivo').value;

        try {
            const res = await fetch(`/api/apoyos/${id}/observar`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ motivo })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al observar la solicitud');

            window.mostrarMensaje?.('Solicitud observada exitosamente. Notificación enviada al solicitante.', 'success');
            cerrarModalObservarAdmin();
            cargarApoyosAdmin();
        } catch (err) {
            window.mostrarMensaje?.(err.message, 'error');
        }
    }

    // Modal Rechazar (Admin)
    function abrirModalRechazarAdmin(apoyoId) {
        const motivo = prompt('Ingresa el motivo del rechazo de la solicitud:');
        if (motivo === null) return;
        if (!motivo.trim() || motivo.trim().length < 5) {
            window.mostrarMensaje?.('El motivo de rechazo debe tener al menos 5 caracteres.', 'error');
            return;
        }

        fetch(`/api/apoyos/${apoyoId}/rechazar`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ motivo: motivo.trim() })
        })
        .then(res => res.json().then(data => ({ ok: res.ok, data })))
        .then(({ ok, data }) => {
            if (!ok) throw new Error(data.error || 'Error al rechazar solicitud');
            window.mostrarMensaje?.('Solicitud rechazada.', 'success');
            cargarApoyosAdmin();
        })
        .catch(err => window.mostrarMensaje?.(err.message, 'error'));
    }

    // SECCIÓN DEL TÉCNICO: Tareas de Apoyo en 4 grupos
    async function cargarTareasTecnico() {
        const container = document.getElementById('techTareasContainer');
        const activeTab = window.techApoyoTabActual || 'hoy';
        if (!container) return;

        try {
            container.innerHTML = '<p class="text-muted" style="padding:20px;">Cargando tareas de apoyo asignadas...</p>';
            const res = await fetch('/api/apoyos', { headers: authHeaders() });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al cargar tareas');

            const hoyStr = new Date().toISOString().slice(0, 10);

            // Filtrar en 4 grupos
            const grupos = {
                hoy: data.filter(a => String(a.fecha_evento).slice(0, 10) === hoyStr && ['Programada', 'En atencion'].includes(a.estado)),
                proximas: data.filter(a => String(a.fecha_evento).slice(0, 10) > hoyStr && a.estado === 'Programada'),
                atencion_pendiente: data.filter(a => a.atencion_no_registrada),
                finalizadas: data.filter(a => ['Finalizada', 'Impedida'].includes(a.estado))
            };

            // Actualizar badges de conteo en las pestañas
            const bHoy = document.getElementById('count-tech-hoy');
            const bProx = document.getElementById('count-tech-prox');
            const bPend = document.getElementById('count-tech-pend');
            const bFin = document.getElementById('count-tech-fin');

            if (bHoy) bHoy.textContent = grupos.hoy.length;
            if (bProx) bProx.textContent = grupos.proximas.length;
            if (bPend) bPend.textContent = grupos.atencion_pendiente.length;
            if (bFin) bFin.textContent = grupos.finalizadas.length;

            const bannerAprobadas = document.getElementById('techTareasAprobadasAlert');
            if (bannerAprobadas) {
                const aprobadasPendientes = data.filter(a => a.estado === 'Aprobada');
                if (aprobadasPendientes.length > 0 && (window.currentUser?.rol === 'admin' || window.currentUser?.rol === 'superadmin')) {
                    bannerAprobadas.innerHTML = `<i class="ph ph-info" style="font-size:1.1rem; vertical-align:middle;"></i> Tienes <strong>${aprobadasPendientes.length} solicitud(es) aprobada(s)</strong> pendiente(s) de asignar técnico. Ve a <a href="#" onclick="window.cambiarVista('apoyos'); return false;" style="text-decoration:underline; font-weight:700; color:#1e40af;">Apoyos programados</a> y haz clic en el botón <strong>Programar</strong> para asignarle un técnico responsable y que pase a sus tareas.`;
                    bannerAprobadas.style.display = 'block';
                } else {
                    bannerAprobadas.style.display = 'none';
                }
            }

            const items = grupos[activeTab] || [];

            if (items.length === 0) {
                container.innerHTML = `
                    <div style="text-align:center; padding:36px; color:var(--text-secondary);">
                        <i class="ph ph-check-circle" style="font-size:2.5rem; opacity:0.5; display:block; margin-bottom:8px;"></i>
                        <p style="margin:0;">No tienes tareas en este grupo (${activeTab}).</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = items.map(apoyo => {
                const fecha = apoyo.fecha_evento ? String(apoyo.fecha_evento).slice(0, 10) : '—';
                const prep = apoyo.hora_preparacion ? apoyo.hora_preparacion.slice(0, 5) : '—';
                const inicio = apoyo.hora_inicio ? apoyo.hora_inicio.slice(0, 5) : '—';
                const fin = apoyo.hora_fin ? apoyo.hora_fin.slice(0, 5) : '—';
                const apoyosTxt = (apoyo.apoyos_requeridos || []).map(t => LABELS_TIPO_APOYO[t] || t).join(', ');

                return `
                    <div class="tech-task-card" style="border:1px solid var(--border-color); border-radius:8px; padding:16px; margin-bottom:14px; background:var(--bg-main);">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
                            <div>
                                <div style="display:flex; gap:8px; align-items:center;">
                                    <span style="font-weight:700; color:var(--primary-color);">${escapeHtml(apoyo.codigo)}</span>
                                    ${apoyo.recepcion_confirmada ? `<span style="font-size:0.75rem; color:#16a34a; font-weight:600;"><i class="ph ph-check-bold"></i> Recepción confirmada</span>` : ''}
                                </div>
                                <h4 style="margin:4px 0 6px 0; font-size:1.05rem;">${escapeHtml(apoyo.nombre_actividad)}</h4>
                                <div style="font-size:0.85rem; color:var(--text-secondary); display:flex; gap:16px; flex-wrap:wrap;">
                                    <span><i class="ph ph-map-pin"></i> <strong>${escapeHtml(apoyo.bloque)} - ${escapeHtml(apoyo.ambiente)}</strong></span>
                                    <span><i class="ph ph-calendar"></i> ${escapeHtml(fecha)}</span>
                                    <span><i class="ph ph-clock"></i> Prep: ${prep} | Inicio: ${inicio} | Fin: ${fin}</span>
                                    <span><i class="ph ph-user"></i> Resp: ${escapeHtml(apoyo.responsable_evento)}</span>
                                </div>
                                <div style="margin-top:6px; font-size:0.85rem;">
                                    <strong>Requerimientos:</strong> ${escapeHtml(apoyosTxt)}
                                </div>
                                ${apoyo.equipos_recursos ? `<div style="font-size:0.82rem; color:var(--text-secondary); margin-top:2px;"><strong>Recursos:</strong> ${escapeHtml(apoyo.equipos_recursos)}</div>` : ''}
                                ${apoyo.atencion_no_registrada ? `
                                    <div style="margin-top:8px; padding:6px 12px; background:#fee2e2; border-left:4px solid #ef4444; border-radius:4px; font-size:0.82rem; color:#b91c1c;">
                                        <strong><i class="ph ph-warning"></i> Atención no registrada:</strong> La hora programada ya inició y no se ha registrado llegada al ambiente.
                                    </div>
                                ` : ''}
                            </div>
                            <div style="display:flex; flex-direction:column; align-items:flex-end; gap:8px;">
                                ${badgeEstadoApoyo(apoyo.estado, apoyo.atencion_no_registrada)}
                                <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end; margin-top:6px;">
                                    <button type="button" class="btn-secondary btn-small" onclick="window.ApoyosModule.verDetalleApoyo(${apoyo.id})">
                                        <i class="ph ph-eye"></i> Detalle
                                    </button>
                                    <a href="/api/apoyos/${apoyo.id}/autorizacion" target="_blank" class="btn-secondary btn-small" title="Descargar autorización">
                                        <i class="ph ph-file-arrow-down"></i>
                                    </a>
                                    ${apoyo.estado === 'Programada' && !apoyo.recepcion_confirmada ? `
                                        <button type="button" class="btn-secondary btn-small" onclick="window.ApoyosModule.confirmarRecepcionTech(${apoyo.id})" style="color:#0284c7;">
                                            <i class="ph ph-check"></i> Confirmar recepción
                                        </button>
                                    ` : ''}
                                    ${apoyo.estado === 'Programada' ? `
                                        <button type="button" class="btn-primary btn-small" onclick="window.ApoyosModule.registrarLlegadaTech(${apoyo.id})" style="background:#2563eb;">
                                            <i class="ph ph-sign-in"></i> Registrar llegada e inicio
                                        </button>
                                        <button type="button" class="btn-secondary btn-small" onclick="window.ApoyosModule.abrirModalImpedimento(${apoyo.id})" style="color:#dc2626;">
                                            <i class="ph ph-prohibit"></i> Impedimento
                                        </button>
                                    ` : ''}
                                    ${apoyo.estado === 'En atencion' ? `
                                        <button type="button" class="btn-primary btn-small" onclick="window.ApoyosModule.abrirModalFinalizar(${apoyo.id})" style="background:#16a34a;">
                                            <i class="ph ph-check-circle"></i> Finalizar servicio
                                        </button>
                                        <button type="button" class="btn-secondary btn-small" onclick="window.ApoyosModule.abrirModalImpedimento(${apoyo.id})" style="color:#dc2626;">
                                            <i class="ph ph-prohibit"></i> Impedimento
                                        </button>
                                    ` : ''}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (err) {
            container.innerHTML = `<p class="text-danger" style="padding:20px;">Error: ${escapeHtml(err.message)}</p>`;
        }
    }

    function cambiarTabTecnico(tabKey) {
        window.techApoyoTabActual = tabKey;
        document.querySelectorAll('.tech-subtab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabKey);
        });
        cargarTareasTecnico();
    }

    async function confirmarRecepcionTech(apoyoId) {
        try {
            const res = await fetch(`/api/apoyos/${apoyoId}/confirmar-recepcion`, {
                method: 'POST',
                headers: authHeaders()
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al confirmar recepción');
            window.mostrarMensaje?.('Recepción de tarea confirmada exitosamente.', 'success');
            cargarTareasTecnico();
        } catch (err) {
            window.mostrarMensaje?.(err.message, 'error');
        }
    }

    async function registrarLlegadaTech(apoyoId) {
        if (!confirm('¿Registrar llegada al ambiente y comienzo de preparación para este evento?')) return;
        try {
            const res = await fetch(`/api/apoyos/${apoyoId}/registrar-llegada`, {
                method: 'POST',
                headers: authHeaders()
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al registrar llegada');
            window.mostrarMensaje?.('Llegada e inicio registrados. El evento pasó a estado "En atención".', 'success');
            cargarTareasTecnico();
        } catch (err) {
            window.mostrarMensaje?.(err.message, 'error');
        }
    }

    // Modal Finalizar Apoyo (Técnico)
    function abrirModalFinalizar(apoyoId) {
        document.getElementById('finalizarApoyoId').value = apoyoId;
        document.getElementById('finalizarTrabajo').value = '';
        document.getElementById('finalizarObservaciones').value = '';
        document.getElementById('finalizarEvidencia').value = '';
        const modal = document.getElementById('modalFinalizarApoyo');
        const overlay = document.getElementById('modalFinalizarApoyoOverlay');
        if (modal) modal.style.display = 'block';
        if (overlay) overlay.style.display = 'block';
    }

    function cerrarModalFinalizar() {
        const modal = document.getElementById('modalFinalizarApoyo');
        const overlay = document.getElementById('modalFinalizarApoyoOverlay');
        if (modal) modal.style.display = 'none';
        if (overlay) overlay.style.display = 'none';
    }

    async function enviarFinalizacionApoyo(e) {
        e.preventDefault();
        const form = e.target;
        const id = document.getElementById('finalizarApoyoId').value;
        const formData = new FormData(form);

        try {
            const res = await fetch(`/api/apoyos/${id}/finalizar`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${getAuthToken()}` },
                body: formData
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al finalizar el apoyo');

            window.mostrarMensaje?.('Servicio de apoyo técnico finalizado exitosamente.', 'success');
            cerrarModalFinalizar();
            cargarTareasTecnico();
            if (window.currentUser?.rol === 'admin' || window.currentUser?.rol === 'superadmin') {
                cargarApoyosAdmin();
            }
        } catch (err) {
            window.mostrarMensaje?.(err.message, 'error');
        }
    }

    // Modal Informar Impedimento (Técnico)
    function abrirModalImpedimento(apoyoId) {
        document.getElementById('impedimentoApoyoId').value = apoyoId;
        document.getElementById('impedimentoMotivo').value = '';
        const modal = document.getElementById('modalImpedimentoApoyo');
        const overlay = document.getElementById('modalImpedimentoApoyoOverlay');
        if (modal) modal.style.display = 'block';
        if (overlay) overlay.style.display = 'block';
    }

    function cerrarModalImpedimento() {
        const modal = document.getElementById('modalImpedimentoApoyo');
        const overlay = document.getElementById('modalImpedimentoApoyoOverlay');
        if (modal) modal.style.display = 'none';
        if (overlay) overlay.style.display = 'none';
    }

    async function enviarImpedimentoApoyo(e) {
        e.preventDefault();
        const id = document.getElementById('impedimentoApoyoId').value;
        const motivo = document.getElementById('impedimentoMotivo').value;

        try {
            const res = await fetch(`/api/apoyos/${id}/informar-impedimento`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ motivo })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al informar impedimento');

            window.mostrarMensaje?.('Impedimento informado y notificado a la administración.', 'success');
            cerrarModalImpedimento();
            cargarTareasTecnico();
            if (window.currentUser?.rol === 'admin' || window.currentUser?.rol === 'superadmin') {
                cargarApoyosAdmin();
            }
        } catch (err) {
            window.mostrarMensaje?.(err.message, 'error');
        }
    }

    // Modal Detalle Completo de Apoyo
    async function verDetalleApoyo(apoyoId) {
        try {
            const res = await fetch(`/api/apoyos/${apoyoId}`, { headers: authHeaders() });
            const apoyo = await res.json();
            if (!res.ok) throw new Error(apoyo.error || 'No se pudo consultar el detalle');

            const content = document.getElementById('modalDetalleApoyoContent');
            if (!content) return;

            const fecha = apoyo.fecha_evento ? String(apoyo.fecha_evento).slice(0, 10) : '—';
            const prep = apoyo.hora_preparacion ? apoyo.hora_preparacion.slice(0, 5) : '—';
            const inicio = apoyo.hora_inicio ? apoyo.hora_inicio.slice(0, 5) : '—';
            const fin = apoyo.hora_fin ? apoyo.hora_fin.slice(0, 5) : '—';
            const apoyosList = (apoyo.apoyos_requeridos || []).map(t => LABELS_TIPO_APOYO[t] || t);

            content.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                    <div>
                        <h3 style="margin:0; font-size:1.2rem;">${escapeHtml(apoyo.nombre_actividad)}</h3>
                        <span style="font-weight:700; color:var(--primary-color);">${escapeHtml(apoyo.codigo)}</span>
                    </div>
                    <div>${badgeEstadoApoyo(apoyo.estado, apoyo.atencion_no_registrada)}</div>
                </div>

                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px; margin-bottom:16px; background:var(--bg-main); padding:14px; border-radius:8px; border:1px solid var(--border-color);">
                    <div><strong>Ubicación:</strong> ${escapeHtml(apoyo.bloque)} - ${escapeHtml(apoyo.ambiente)}</div>
                    <div><strong>Fecha:</strong> ${escapeHtml(fecha)}</div>
                    <div><strong>Horario de preparación:</strong> ${prep}</div>
                    <div><strong>Horario del evento:</strong> ${inicio} a ${fin}</div>
                    <div><strong>Solicitante:</strong> ${escapeHtml(apoyo.solicitante_contacto)}</div>
                    <div><strong>Área organizadora:</strong> ${escapeHtml(apoyo.area_organizadora)}</div>
                    <div><strong>Responsable del evento:</strong> ${escapeHtml(apoyo.responsable_evento)}</div>
                    <div><strong>Técnico asignado:</strong> ${escapeHtml(apoyo.tecnico_nombre || 'Sin asignar')}</div>
                </div>

                <div style="margin-bottom:14px;">
                    <strong>Descripción:</strong>
                    <p style="margin:4px 0; color:var(--text-secondary);">${escapeHtml(apoyo.descripcion)}</p>
                </div>

                <div style="margin-bottom:14px;">
                    <strong>Requerimientos técnicos solicitados:</strong>
                    <ul style="margin:4px 0 0 20px; padding:0;">
                        ${apoyosList.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
                    </ul>
                </div>

                ${apoyo.equipos_recursos ? `
                    <div style="margin-bottom:14px;">
                        <strong>Equipos o recursos adicionales:</strong>
                        <p style="margin:4px 0; color:var(--text-secondary);">${escapeHtml(apoyo.equipos_recursos)}</p>
                    </div>
                ` : ''}

                <div style="margin-bottom:16px; display:flex; gap:12px; align-items:center;">
                    <strong>Autorización adjunta:</strong>
                    <a href="/api/apoyos/${apoyo.id}/autorizacion" target="_blank" class="btn-secondary btn-small">
                        <i class="ph ph-file-arrow-down"></i> Descargar ${escapeHtml(apoyo.archivo_autorizacion_nombre || 'autorizacion.pdf')}
                    </a>
                </div>

                ${apoyo.trabajo_realizado ? `
                    <div style="margin-bottom:14px; background:#f0fdf4; border:1px solid #bbf7d0; padding:12px; border-radius:6px;">
                        <strong style="color:#15803d;"><i class="ph ph-check-circle"></i> Trabajo técnico realizado:</strong>
                        <p style="margin:4px 0; color:#166534;">${escapeHtml(apoyo.trabajo_realizado)}</p>
                        ${apoyo.observaciones_cierre ? `<p style="margin:4px 0; font-size:0.85rem; color:#166534;"><strong>Observaciones de cierre:</strong> ${escapeHtml(apoyo.observaciones_cierre)}</p>` : ''}
                    </div>
                ` : ''}

                ${apoyo.motivo_impedimento ? `
                    <div style="margin-bottom:14px; background:#fff1f2; border:1px solid #fecdd3; padding:12px; border-radius:6px;">
                        <strong style="color:#be123c;"><i class="ph ph-prohibit"></i> Impedimento reportado:</strong>
                        <p style="margin:4px 0; color:#9f1239;">${escapeHtml(apoyo.motivo_impedimento)}</p>
                    </div>
                ` : ''}

                <div style="border-top:1px solid var(--border-color); padding-top:14px; margin-top:16px;">
                    <h4 style="margin:0 0 10px 0; font-size:0.95rem;">Historial de seguimiento</h4>
                    <div style="max-height:180px; overflow-y:auto;">
                        ${(apoyo.historial || []).map(h => `
                            <div style="font-size:0.8rem; margin-bottom:8px; border-bottom:1px dashed var(--border-color); padding-bottom:6px;">
                                <span style="color:var(--text-secondary);">${new Date(h.creado_en).toLocaleString('es-PE')}</span> ·
                                <strong>${escapeHtml(h.accion)}</strong>: ${escapeHtml(h.detalles || '')}
                                <span style="color:var(--text-secondary);">(${escapeHtml(h.username || 'Sistema')})</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;

            const modal = document.getElementById('modalDetalleApoyo');
            const overlay = document.getElementById('modalDetalleApoyoOverlay');
            if (modal) modal.style.display = 'block';
            if (overlay) overlay.style.display = 'block';
        } catch (err) {
            window.mostrarMensaje?.(err.message, 'error');
        }
    }

    function cerrarDetalleApoyo() {
        const modal = document.getElementById('modalDetalleApoyo');
        const overlay = document.getElementById('modalDetalleApoyoOverlay');
        if (modal) modal.style.display = 'none';
        if (overlay) overlay.style.display = 'none';
    }

    // Inicializador general
    function inicializar() {
        inicializarCatalogoAmbientes('apoyoBloque', 'apoyoAmbiente');

        // Escuchar cambios de fecha y hora para cruces
        ['apoyoFechaEvento', 'apoyoHoraPrep', 'apoyoHoraInicio', 'apoyoHoraFin'].forEach(id => {
            document.getElementById(id)?.addEventListener('change', verificarConflictosFormulario);
        });

        ['adminProgramarFecha', 'adminProgramarPrep', 'adminProgramarInicio', 'adminProgramarFin', 'adminProgramarTecnico'].forEach(id => {
            document.getElementById(id)?.addEventListener('change', verificarConflictosProgramacion);
        });

        // Formularios
        document.getElementById('formSolicitudApoyo')?.addEventListener('submit', enviarSolicitudApoyo);
        document.getElementById('formSubsanarApoyo')?.addEventListener('submit', enviarSubsanacion);
        document.getElementById('formProgramarApoyo')?.addEventListener('submit', guardarProgramacionApoyo);
        document.getElementById('formObservarApoyo')?.addEventListener('submit', enviarObservacionAdmin);
        document.getElementById('formFinalizarApoyo')?.addEventListener('submit', enviarFinalizacionApoyo);
        document.getElementById('formImpedimentoApoyo')?.addEventListener('submit', enviarImpedimentoApoyo);

        // Botón "Solicitar apoyo para un evento"
        document.getElementById('btnSolicitarApoyoEvento')?.addEventListener('click', abrirModalSolicitudApoyo);

        // Subtabs en Mis Tickets
        document.getElementById('tabMisTickets')?.addEventListener('click', () => cambiarSubtabTickets('tickets'));
        document.getElementById('tabMisApoyos')?.addEventListener('click', () => cambiarSubtabTickets('apoyos'));

        // Filtro de estado en Admin
        document.getElementById('adminApoyosFiltroEstado')?.addEventListener('change', cargarApoyosAdmin);

        // Subtabs de tareas de técnico
        document.querySelectorAll('.tech-subtab-btn').forEach(btn => {
            btn.addEventListener('click', () => cambiarTabTecnico(btn.dataset.tab));
        });
    }

    function cambiarSubtabTickets(subtab) {
        const tabTickets = document.getElementById('tabMisTickets');
        const tabApoyos = document.getElementById('tabMisApoyos');
        const containerTickets = document.getElementById('misTicketsContainer');
        const containerApoyos = document.getElementById('misApoyosContainer');

        if (subtab === 'apoyos') {
            if (tabTickets) { tabTickets.style.borderBottom = 'none'; tabTickets.style.color = 'var(--text-secondary)'; }
            if (tabApoyos) { tabApoyos.style.borderBottom = '3px solid var(--primary-color)'; tabApoyos.style.color = 'var(--text-primary)'; }
            if (containerTickets) containerTickets.style.display = 'none';
            if (containerApoyos) containerApoyos.style.display = 'block';
            cargarMisSolicitudesApoyo();
        } else {
            if (tabTickets) { tabTickets.style.borderBottom = '3px solid var(--primary-color)'; tabTickets.style.color = 'var(--text-primary)'; }
            if (tabApoyos) { tabApoyos.style.borderBottom = 'none'; tabApoyos.style.color = 'var(--text-secondary)'; }
            if (containerTickets) containerTickets.style.display = 'block';
            if (containerApoyos) containerApoyos.style.display = 'none';
        }
    }

    const api = {
        inicializar,
        abrirModalSolicitudApoyo,
        cerrarModalSolicitudApoyo,
        cargarMisSolicitudesApoyo,
        abrirModalSubsanar,
        cerrarModalSubsanar,
        cargarApoyosAdmin,
        abrirModalProgramar,
        cerrarModalProgramar,
        aprobarApoyoAdmin,
        abrirModalObservarAdmin,
        cerrarModalObservarAdmin,
        abrirModalRechazarAdmin,
        cargarTareasTecnico,
        cambiarTabTecnico,
        confirmarRecepcionTech,
        registrarLlegadaTech,
        abrirModalFinalizar,
        cerrarModalFinalizar,
        abrirModalImpedimento,
        cerrarModalImpedimento,
        verDetalleApoyo,
        cerrarDetalleApoyo,
        cambiarSubtabTickets
    };

    global.ApoyosModule = api;
    window.cambiarSubtabTickets = cambiarSubtabTickets;

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', inicializar);
        } else {
            inicializar();
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);

