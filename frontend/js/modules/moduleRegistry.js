(function(global) {
    const registry = {};

    function registerModule(name, factory) {
        if (!registry[name]) {
            registry[name] = factory;
        }
    }

    function initModules() {
        Object.entries(registry).forEach(([name, factory]) => {
            try {
                const instance = typeof factory === 'function' ? factory() : factory;
                if (instance && typeof instance.init === 'function') {
                    instance.init();
                }
            } catch (error) {
                console.error(`No se pudo inicializar el módulo ${name}:`, error);
            }
        });
    }

    global.UTEAApp = global.UTEAApp || {};
    global.UTEAApp.modules = registry;
    global.UTEAApp.initModules = initModules;
    global.UTEAApp.registerModule = registerModule;
})(window);
