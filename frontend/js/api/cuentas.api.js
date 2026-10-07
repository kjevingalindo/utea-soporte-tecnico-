(function exposeCuentasApi(global) {
    function unwrap(data) {
        return data?.success === true && Object.prototype.hasOwnProperty.call(data, 'data')
            ? data.data
            : data;
    }

    async function requestData(endpoint, options) {
        const response = await global.fetchAPI(endpoint, options);
        const result = await response.json();
        return unwrap(result);
    }

    global.CuentasApi = Object.freeze({
        getPlataformas() {
            return requestData('/api/cuentas/plataformas');
        },
        getFacultades() {
            return requestData('/api/cuentas/facultades');
        },
        getIncidencias() {
            return requestData('/api/cuentas/incidencias');
        },
        getIncidencia(incidenciaId) {
            return requestData(`/api/cuentas/incidencias/${encodeURIComponent(incidenciaId)}`);
        },
        getStats() {
            return requestData('/api/cuentas/stats');
        },
        crearTicketCuenta(formData) {
            return requestData('/api/cuentas/incidencias', {
                method: 'POST',
                body: formData
            });
        },
        escalarAAbancay(ticketId, motivo) {
            return requestData(`/api/cuentas/incidencias/${encodeURIComponent(ticketId)}/escalar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ motivo })
            });
        },
        registrarSolucion(incidenciaId, solucion) {
            return requestData(`/api/cuentas/incidencias/${encodeURIComponent(incidenciaId)}/solucion`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ solucion })
            });
        },
        subirEvidencia(incidenciaId, formData) {
            return requestData(`/api/cuentas/incidencias/${encodeURIComponent(incidenciaId)}/evidencias`, {
                method: 'POST',
                body: formData
            });
        }
    });
})(window);
