(function exposeApi(global) {
    class ApiError extends Error {
        constructor(message, { status = 0, data = null, cause } = {}) {
            super(message, { cause });
            this.name = 'ApiError';
            this.status = status;
            this.data = data;
        }
    }

    async function fetchAPI(endpoint, options = {}) {
        const { allowHttpErrors = false, ...requestOptions } = options;
        const headers = new Headers(requestOptions.headers || {});
        const token = global.localStorage?.getItem('token');
        if (token && !headers.has('Authorization')) {
            headers.set('Authorization', `Bearer ${token}`);
        }

        let response;
        try {
            response = await global.fetch(endpoint, { ...requestOptions, headers });
        } catch (cause) {
            const message = cause?.name === 'AbortError' || cause?.name === 'TimeoutError'
                ? 'La solicitud agotó el tiempo de espera'
                : 'No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.';
            throw new ApiError(message, { cause });
        }

        if (!response.ok && !allowHttpErrors) {
            let data = null;
            try {
                data = await response.clone().json();
            } catch (cause) {
                if (!(cause instanceof SyntaxError)) {
                    throw new ApiError('No se pudo leer la respuesta de error del servidor', {
                        status: response.status,
                        cause
                    });
                }
            }
            throw new ApiError(
                data?.error || data?.message || `El servidor respondió con HTTP ${response.status}`,
                { status: response.status, data }
            );
        }
        return response;
    }

    global.fetchAPI = fetchAPI;
    global.ApiError = ApiError;
})(window);
