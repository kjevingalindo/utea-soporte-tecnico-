(function exposeComments(global) {
    function createCommentsService(request = global.fetchAPI) {
        if (typeof request !== 'function') {
            throw new Error('El cliente HTTP de comentarios no está disponible.');
        }

        async function readResponse(response) {
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data.error || data.message || `Error HTTP ${response.status} en comentarios.`);
            }
            return data;
        }

        return Object.freeze({
            async list(ticketId) {
                return readResponse(await request(`/api/comentarios/${encodeURIComponent(ticketId)}`));
            },
            async add(ticketId, comentario) {
                return readResponse(await request('/api/comentarios', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ticket_id: ticketId, comentario })
                }));
            }
        });
    }

    global.UTEAComments = Object.freeze({ createCommentsService });
    if (typeof module !== 'undefined' && module.exports) module.exports = global.UTEAComments;
})(typeof window === 'undefined' ? globalThis : window);
