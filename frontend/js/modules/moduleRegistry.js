(function(global) {
    const registry = {};
    const initialized = new Set();

    function registerModule(name, factory) {
        if (registry[name] && registry[name] !== factory) {
            throw new Error(`El módulo ${name} ya está registrado.`);
        }
        registry[name] = factory;
    }

    function initModules() {
        Object.entries(registry).forEach(([name, factory]) => {
            if (initialized.has(name)) return;
            try {
                const instance = typeof factory === 'function' ? factory() : factory;
                if (instance && typeof instance.init === 'function') {
                    instance.init();
                }
                initialized.add(name);
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
