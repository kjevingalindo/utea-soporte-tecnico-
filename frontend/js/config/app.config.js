(function exposeConfig(global) {
    const config = Object.freeze({
        apiBaseUrl: '',
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
})(window);
