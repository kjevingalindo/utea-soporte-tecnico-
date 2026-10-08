(function exposeHttpClient(global) {
    class ApiError extends Error {
        constructor(message, { status = 0, data = null, cause } = {}) {
            super(message);
            this.name = 'ApiError';
            this.status = status;
            this.data = data;
            this.cause = cause;
        }
    }

    class HttpClient {
        constructor() {
            this.pendingRequests = new Map();
        }

        getAuthToken() {
            return global.localStorage ? global.localStorage.getItem('token') : null;
        }

        buildHeaders(headers = {}, includeAuth = true) {
            const merged = new Headers(headers);
            const token = this.getAuthToken();
            if (includeAuth && token && !merged.has('Authorization')) {
                merged.set('Authorization', `Bearer ${token}`);
            }
            return merged;
        }

        request(endpoint, options = {}) {
            const { allowHttpErrors = false, timeoutMs = global.UTEAConfig?.defaultTimeoutMs || 30000, signal, ...requestOptions } = options;
            const finalEndpoint = endpoint.startsWith('http') ? endpoint : `${global.UTEAConfig?.apiBaseUrl || ''}${endpoint}`;
            const controller = new AbortController();
            const combinedSignal = signal || controller.signal;
            const key = `${(requestOptions.method || 'GET').toUpperCase()}::${finalEndpoint}`;
            const duplicate = this.pendingRequests.get(key);
            if (duplicate && requestOptions.method !== 'POST') {
                return duplicate;
            }

            const timeoutId = global.setTimeout(() => controller.abort(), timeoutMs);
            const headers = this.buildHeaders(requestOptions.headers || {}, true);
            const requestPromise = global.fetch(finalEndpoint, { ...requestOptions, headers, signal: combinedSignal })
                .finally(() => {
                    global.clearTimeout(timeoutId);
                    this.pendingRequests.delete(key);
                })
                .then(async response => {
                    if (!response.ok && !allowHttpErrors) {
                        let data = null;
                        try {
                            data = await response.clone().json();
                        } catch (error) {
                            data = null;
                        }
                        throw new ApiError(data?.error || data?.message || `Error HTTP ${response.status}`, {
                            status: response.status,
                            data
                        });
                    }
                    return response;
                })
                .catch(error => {
                    if (error?.name === 'AbortError') {
                        throw new ApiError('La solicitud fue cancelada antes de completarse.', { status: 499, cause: error });
                    }
                    throw error;
                });

            this.pendingRequests.set(key, requestPromise);
            return requestPromise;
        }

        get(endpoint, options = {}) {
            return this.request(endpoint, { ...options, method: 'GET' });
        }

        post(endpoint, body, options = {}) {
            return this.request(endpoint, { ...options, method: 'POST', body: JSON.stringify(body) });
        }

        put(endpoint, body, options = {}) {
            return this.request(endpoint, { ...options, method: 'PUT', body: JSON.stringify(body) });
        }

        patch(endpoint, body, options = {}) {
            return this.request(endpoint, { ...options, method: 'PATCH', body: JSON.stringify(body) });
        }

        delete(endpoint, options = {}) {
            return this.request(endpoint, { ...options, method: 'DELETE' });
        }
    }

    const httpClient = new HttpClient();
    global.UTEAHttpClient = httpClient;
    global.fetchAPI = function fetchAPI(endpoint, options = {}) {
        return httpClient.request(endpoint, options);
    };
    global.ApiError = ApiError;
})(window);
