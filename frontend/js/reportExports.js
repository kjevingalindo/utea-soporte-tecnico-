(function exposeReportExports(global) {
    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function csvCell(value) {
        return `"${String(value ?? '').replace(/"/g, '""')}"`;
    }

    function formatDate(value, timestamp) {
        const numericTimestamp = timestamp(value);
        if (!numericTimestamp) return '—';
        return new Date(numericTimestamp).toLocaleString('es-PE', {
            timeZone: 'America/Lima'
        });
    }

    function buildCsv({
        monthLabel,
        tickets,
        resolved,
        open,
        metrics,
        formatDuration,
        timestamp,
        apoyos
    }) {
        const rows = [
            ['Reporte mensual de soporte UTEA', monthLabel],
            ['Casos únicos registrados durante el mes', tickets.length],
            ['Casos resueltos durante el mes', resolved.length],
            ['Resolución de casos registrados durante el mes', `${metrics.registeredResolutionPct}%`],
            ['Casos registrados durante el mes que ya están resueltos', metrics.registeredResolved.length],
            ['Casos registrados este mes que siguen abiertos', open.length],
            ['Tiempo medio de resolución en el mes', formatDuration(metrics.resolutionHours)],
            [],
            ['Ticket / cuenta vinculados', 'Asunto', 'Solicitante', 'Oficina', 'Categoría', 'Técnico', 'Prioridad', 'Estado', 'Fecha de registro'],
            ...tickets.map(ticket => [
                ticket.reportReference || `#${ticket.id}`,
                ticket.titulo || 'Sin asunto',
                ticket.solicitante_nombre || ticket.username || '—',
                ticket.oficina_nombre || '—',
                ticket.categoria_nombre || 'Sin categoría',
                ticket.tecnico || 'Sin asignar',
                ticket.prioridad || '—',
                ticket.estado || '—',
                formatDate(ticket.fecha_creacion, timestamp)
            ]),
            [],
            ['Productividad: casos resueltos durante el mes', monthLabel],
            ['Ticket / cuenta vinculados', 'Asunto', 'Solicitante', 'Oficina', 'Categoría', 'Técnico', 'Prioridad', 'Estado', 'Fecha de registro', 'Fecha de resolución'],
            ...resolved.map(ticket => [
                ticket.reportReference || `#${ticket.id}`,
                ticket.titulo || 'Sin asunto',
                ticket.solicitante_nombre || ticket.username || '—',
                ticket.oficina_nombre || '—',
                ticket.categoria_nombre || 'Sin categoría',
                ticket.tecnico || 'Sin asignar',
                ticket.prioridad || '—',
                ticket.estado || '—',
                formatDate(ticket.fecha_creacion, timestamp),
                formatDate(ticket.reportResolvedAt, timestamp)
            ])
        ];
        return `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}`;
    }

    function buildPdfHtml({
        monthLabel,
        tickets,
        resolved,
        open,
        metrics,
        formatDuration,
        timestamp,
        apoyos
    }) {
        const ticketRows = tickets.map(ticket => `
            <tr>
                <td>${escapeHtml(ticket.reportReference || `#${ticket.id}`)}</td>
                <td>${escapeHtml(ticket.solicitante_nombre || ticket.username || '—')}</td>
                <td>${escapeHtml(ticket.oficina_nombre || '—')}</td>
                <td>${escapeHtml(ticket.categoria_nombre || 'Sin categoría')}</td>
                <td>${escapeHtml(ticket.titulo || 'Sin asunto')}</td>
                <td>${escapeHtml(ticket.tecnico || 'Sin asignar')}</td>
                <td>${escapeHtml(ticket.prioridad || '—')}</td>
                <td>${escapeHtml(ticket.estado || '—')}</td>
                <td>${escapeHtml(formatDate(ticket.fecha_creacion, timestamp))}</td>
            </tr>
        `).join('');
        const resolvedRows = resolved.map(ticket => `
            <tr>
                <td>${escapeHtml(ticket.reportReference || `#${ticket.id}`)}</td>
                <td>${escapeHtml(ticket.solicitante_nombre || ticket.username || '—')}</td>
                <td>${escapeHtml(ticket.oficina_nombre || '—')}</td>
                <td>${escapeHtml(ticket.categoria_nombre || 'Sin categoría')}</td>
                <td>${escapeHtml(ticket.titulo || 'Sin asunto')}</td>
                <td>${escapeHtml(ticket.tecnico || 'Sin asignar')}</td>
                <td>${escapeHtml(ticket.prioridad || '—')}</td>
                <td>${escapeHtml(ticket.estado || '—')}</td>
                <td>${escapeHtml(formatDate(ticket.fecha_creacion, timestamp))}</td>
                <td>${escapeHtml(formatDate(ticket.reportResolvedAt, timestamp))}</td>
            </tr>
        `).join('');

        return `<!doctype html><html lang="es"><head><meta charset="utf-8">
            <title>Reporte UTEA ${escapeHtml(monthLabel)}</title>
            <style>
                body{font-family:Arial,sans-serif;margin:32px;color:#1e293b}
                header{text-align:center;border-bottom:3px solid #0b3f8a;padding-bottom:16px;margin-bottom:24px}
                h1{color:#0b3f8a;font-size:22px;margin:0}header p{color:#475569;margin:8px 0 0}
                .kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin:20px 0}
                .kpi{padding:14px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc}
                .kpi span{display:block;color:#475569;font-size:12px}.kpi strong{display:block;color:#0b3f8a;font-size:22px;margin-top:6px}
                table{width:100%;border-collapse:collapse;font-size:11px;margin-top:16px}
                th,td{border:1px solid #cbd5e1;padding:7px;text-align:left}th{background:#f1f5f9}
            </style></head><body>
            <header><h1>Universidad Tecnológica de los Andes</h1>
            <p>Reporte mensual de soporte · Sede Andahuaylas · ${escapeHtml(monthLabel)}</p></header>
            <div class="kpis">
                <div class="kpi"><span>Casos únicos registrados</span><strong>${tickets.length}</strong></div>
                <div class="kpi"><span>Casos resueltos durante el mes</span><strong>${resolved.length}</strong></div>
                <div class="kpi"><span>Resolución de los registrados este mes</span><strong>${metrics.registeredResolutionPct}%</strong></div>
                <div class="kpi"><span>Registrados en el mes que siguen abiertos</span><strong>${open.length}</strong></div>
                <div class="kpi"><span>Tiempo medio de resolución del mes</span><strong>${escapeHtml(formatDuration(metrics.resolutionHours))}</strong></div>
            </div>

            ${apoyos ? `
            <h2 style="margin-top:28px;">Servicios programados: Apoyos técnicos para eventos y ambientes</h2>
            <div class="kpis">
                <div class="kpi"><span>Solicitados</span><strong>${apoyos.solicitados || 0}</strong></div>
                <div class="kpi"><span>Programados</span><strong>${apoyos.programados || 0}</strong></div>
                <div class="kpi"><span>Finalizados</span><strong>${apoyos.finalizados || 0}</strong></div>
                <div class="kpi"><span>Atención pend. reg.</span><strong style="color:#dc2626;">${apoyos.atencionPendienteRegistrar || 0}</strong></div>
                <div class="kpi"><span>Tiempo medio cobertura</span><strong>${apoyos.tiempoPromedioCoberturaHoras || 0} h</strong></div>
            </div>
            <p style="font-size:12px; color:#475569;">
                <strong>Tipo más solicitado:</strong> ${escapeHtml(apoyos.tiposMasSolicitados?.[0]?.tipo || '—')} · 
                <strong>Ambiente con mayor demanda:</strong> ${escapeHtml(apoyos.ambientesMayorDemanda?.[0] ? apoyos.ambientesMayorDemanda[0].ambiente + ' (' + apoyos.ambientesMayorDemanda[0].bloque + ')' : '—')}
            </p>
            ` : ''}
            <h2>Detalle de incidencias</h2>
            <table><thead><tr><th>ID</th><th>Solicitante</th><th>Oficina</th><th>Categoría</th><th>Asunto</th><th>Técnico</th><th>Prioridad</th><th>Estado</th><th>Registro</th></tr></thead>
            <tbody>${ticketRows || '<tr><td colspan="9">No hay incidencias registradas en este periodo.</td></tr>'}</tbody></table>
            <h2>Productividad: casos resueltos durante el mes</h2>
            <table><thead><tr><th>ID</th><th>Solicitante</th><th>Oficina</th><th>Categoría</th><th>Asunto</th><th>Técnico</th><th>Prioridad</th><th>Estado</th><th>Registro</th><th>Resolución</th></tr></thead>
            <tbody>${resolvedRows || '<tr><td colspan="10">No hay casos resueltos durante este mes.</td></tr>'}</tbody></table>
            <script>window.onload=()=>window.print()</script>
            </body></html>`;
    }

    function downloadCsv(csv, monthKey) {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Reporte_UTEA_${monthKey}.csv`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function openPdf(html) {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return false;
        printWindow.document.write(html);
        printWindow.document.close();
        return true;
    }

    const api = { buildCsv, buildPdfHtml, downloadCsv, openPdf };
    global.UTEAReportExports = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
