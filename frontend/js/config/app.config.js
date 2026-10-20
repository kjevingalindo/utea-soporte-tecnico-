(function exposeConfig(global) {
    const loc = global.location;
    const isApache = loc && (loc.port === '' || loc.port === '80' || loc.port === '443') && (loc.pathname || '').includes('/sistema-tickets');
    const detectedBaseUrl = isApache
        ? `${loc.protocol}//${loc.hostname}:3000`
        : '';

    const config = Object.freeze({
        apiBaseUrl: detectedBaseUrl,
        timezone: 'America/Lima',
        defaultTimeoutMs: 30000,
        authTokenKey: 'token',
        requestKeyPrefix: 'utea.pending',
        userKeys: {
            username: 'username',
            role: 'rol',
            userRole: 'userRole'
        }
    });

    global.UTEAConfig = config;
    global.UTEAAppConfig = config;
})(typeof window === 'undefined' ? globalThis : window);
