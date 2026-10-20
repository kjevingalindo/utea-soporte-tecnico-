const test = require('node:test');
const assert = require('node:assert/strict');

test('ticket detail module loads and submits comments through one delegated listener', async () => {
    const previousWindow = global.window;
    const previousForm = global.HTMLFormElement;
    const calls = [];
    const listeners = new Map();
    const list = { textContent: '', scrollTop: 0, scrollHeight: 42 };
    const input = { value: 'Comentario desde el detalle' };
    const button = { disabled: false };
    let serviceCreations = 0;
    const form = {
        id: 'detalleComentarioForm',
        dataset: { ticketId: '27' },
        querySelector(selector) {
            return selector === '#detalleNuevoComentario'
                ? input
                : selector === 'button[type="submit"]' ? button : null;
        }
    };
    const detail = {
        dataset: { ticketId: '27' },
        querySelector(selector) { return selector === '#detalleComentarios' ? list : null; },
        addEventListener(type, listener) {
            listeners.set(type, [...(listeners.get(type) || []), listener]);
        }
    };
    global.HTMLFormElement = class HTMLFormElement {};
    Object.setPrototypeOf(form, global.HTMLFormElement.prototype);
    global.window = {
        document: { getElementById: id => id === 'ticketDetalle' ? detail : null },
        UTEAComments: {
            createCommentsService: () => {
                serviceCreations += 1;
                return {
                    async list(ticketId) {
                        calls.push(['list', ticketId]);
                        return [{ comentario: 'Respuesta' }];
                    },
                    async add(ticketId, comment) {
                        calls.push(['add', ticketId, comment]);
                    }
                };
            }
        },
        UTEASafeText: {
            renderComments(container, comments) {
                calls.push(['render', comments.length]);
            }
        },
        mostrarMensaje: message => calls.push(['error', message])
    };
    const modulePath = require.resolve('../frontend/js/modules/ticketDetailModule');
    delete require.cache[modulePath];

    try {
        const { createTicketDetailModule } = require(modulePath);
        assert.equal(serviceCreations, 0);
        const moduleInstance = createTicketDetailModule();
        moduleInstance.init();
        moduleInstance.init();

        assert.equal(listeners.get('submit').length, 1);
        await global.window.UTEATicketDetail.loadComments(27);
        assert.equal(serviceCreations, 1);
        assert.equal(list.scrollTop, list.scrollHeight);

        const event = {
            target: form,
            preventDefault() { calls.push(['preventDefault']); }
        };
        await listeners.get('submit')[0](event);

        assert.deepEqual(calls, [
            ['list', 27],
            ['render', 1],
            ['preventDefault'],
            ['add', '27', 'Comentario desde el detalle'],
            ['list', '27'],
            ['render', 1]
        ]);
        assert.equal(input.value, '');
        assert.equal(button.disabled, false);
    } finally {
        delete require.cache[modulePath];
        if (previousWindow === undefined) delete global.window;
        else global.window = previousWindow;
        if (previousForm === undefined) delete global.HTMLFormElement;
        else global.HTMLFormElement = previousForm;
    }
});
