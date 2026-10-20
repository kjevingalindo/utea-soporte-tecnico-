const test = require('node:test');
const assert = require('node:assert/strict');
const ticketForm = require('../frontend/js/ticketForm');

function createHarness(overrides = {}) {
    const values = new Map();
    const storage = {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key)
    };
    const evidenceInput = { files: [{ name: 'fake.pdf' }] };
    const button = { disabled: false };
    const form = {
        resetCount: 0,
        reportValidity: () => true,
        querySelector(selector) {
            if (selector === 'button[type="submit"]') return button;
            if (selector === '[name="fotoIncidencia"]') return evidenceInput;
            return null;
        },
        reset() { this.resetCount += 1; }
    };
    let sequence = 0;
    const calls = { create: [], upload: [], refresh: 0, errors: [], successes: [], attachmentFailures: [] };
    const dependencies = {
        storage,
        hasSession: () => true,
        createIdempotencyKey: () => `key-${++sequence}`,
        collect: () => ({ payload: { titulo: 'Caso ficticio' }, officeCode: 'ADM', categoryCode: 'ADM-EQUIPOS' }),
        resolveCatalog: async () => ({ oficina_id: 1, categoria_id: 2 }),
        createTicket: async (payload, key) => {
            calls.create.push({ payload, key });
            return { ticketId: calls.create.length, mensaje: 'Creado' };
        },
        uploadEvidence: async (ticketId, file) => calls.upload.push({ ticketId, file }),
        refreshTickets: async () => { calls.refresh += 1; },
        onError: error => calls.errors.push(error.message),
        onSuccess: message => calls.successes.push(message),
        onAttachmentFailure: failure => calls.attachmentFailures.push(failure),
        onRefreshFailure: () => {},
        ...overrides
    };
    const submit = ticketForm.createSubmitHandler(form, dependencies);
    const dispatchSubmit = () => submit({ preventDefault() {} });
    return { calls, dependencies, dispatchSubmit, evidenceInput, form, storage };
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

test('double submit while create is pending sends only one request', async () => {
    const gate = deferred();
    const harness = createHarness({
        createTicket: async (payload, key) => {
            harness.calls.create.push({ payload, key });
            return gate.promise;
        }
    });
    const first = harness.dispatchSubmit();
    const second = harness.dispatchSubmit();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(harness.calls.create.length, 1);
    gate.resolve({ ticketId: 50, mensaje: 'Creado' });
    await Promise.all([first, second]);
    assert.equal(harness.form.resetCount, 1);
});

test('uncertain server response retries with identical key and payload without duplicating ticket', async () => {
    const serverTickets = new Map();
    let attempt = 0;
    const harness = createHarness({
        createTicket: async (payload, key) => {
            harness.calls.create.push({ payload, key });
            if (!serverTickets.has(key)) serverTickets.set(key, { ticketId: 75 });
            if (++attempt === 1) throw new TypeError('La respuesta no llegó al cliente');
            return serverTickets.get(key);
        }
    });

    await harness.dispatchSubmit();
    await harness.dispatchSubmit();
    assert.equal(harness.calls.create.length, 2);
    assert.equal(harness.calls.create[0].key, harness.calls.create[1].key);
    assert.deepEqual(harness.calls.create[0].payload, harness.calls.create[1].payload);
    assert.equal(serverTickets.size, 1);
    assert.equal(harness.form.resetCount, 1);
});

test('failed evidence remains bound to its created ticket and retries without another ticket request', async () => {
    let uploadAttempt = 0;
    const harness = createHarness({
        createTicket: async (payload, key) => {
            harness.calls.create.push({ payload, key });
            return { ticketId: 88, mensaje: 'Creado' };
        },
        uploadEvidence: async (ticketId, file) => {
            harness.calls.upload.push({ ticketId, file });
            if (++uploadAttempt === 1) throw new Error('Error de carga simulado');
        }
    });

    await harness.dispatchSubmit();
    assert.equal(harness.calls.create.length, 1);
    assert.equal(harness.form.resetCount, 0);
    assert.equal(harness.storage.getItem('utea.pending.ticket.id'), '88');
    assert.equal(harness.calls.attachmentFailures.length, 1);

    await harness.calls.attachmentFailures[0].retry();
    assert.equal(harness.calls.upload.length, 2);
    assert.ok(harness.calls.upload.every(call => call.ticketId === 88));
    assert.equal(harness.calls.create.length, 1);
    assert.equal(harness.form.resetCount, 1);
    assert.equal(harness.storage.getItem('utea.pending.ticket.id'), null);
});

test('refresh failure does not misreport confirmed creation as failure or keep the form pending', async () => {
    const harness = createHarness({
        refreshTickets: async () => { throw new Error('Error de refresco simulado'); },
        onRefreshFailure: (ticketId, error) => harness.calls.errors.push(`${ticketId}: ${error.message}`)
    });

    await harness.dispatchSubmit();
    assert.equal(harness.calls.create.length, 1);
    assert.equal(harness.calls.errors[0], '1: Error de refresco simulado');
    assert.equal(harness.calls.successes.length, 1);
    assert.equal(harness.form.resetCount, 1);
});

test('a subsequent legitimate submission receives a new idempotency key', async () => {
    const harness = createHarness();
    await harness.dispatchSubmit();
    await harness.dispatchSubmit();
    assert.equal(harness.calls.create.length, 2);
    assert.notEqual(harness.calls.create[0].key, harness.calls.create[1].key);
});

