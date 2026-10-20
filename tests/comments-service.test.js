const test = require('node:test');
const assert = require('node:assert/strict');
const { createCommentsService } = require('../frontend/js/comments');

function response(status, body) {
    return {
        ok: status >= 200 && status < 300,
        status,
        async json() { return body; }
    };
}

test('comment service lists ticket comments through the shared authenticated HTTP client', async () => {
    const calls = [];
    const service = createCommentsService(async (...args) => {
        calls.push(args);
        return response(200, [{ comentario: '<b>literal</b>' }]);
    });

    assert.deepEqual(await service.list(27), [{ comentario: '<b>literal</b>' }]);
    assert.deepEqual(calls, [['/api/comentarios/27']]);
});

test('comment service posts distinct ticket and comment values through the shared HTTP client', async () => {
    const calls = [];
    const service = createCommentsService(async (...args) => {
        calls.push(args);
        return response(201, { success: true });
    });

    await Promise.all([
        service.add(27, 'Primero'),
        service.add(28, 'Segundo')
    ]);

    assert.equal(calls.length, 2);
    assert.deepEqual(calls.map(([, options]) => JSON.parse(options.body)), [
        { ticket_id: 27, comentario: 'Primero' },
        { ticket_id: 28, comentario: 'Segundo' }
    ]);
});

test('comment service surfaces backend rejection reasons', async () => {
    const service = createCommentsService(async () => response(403, { error: 'No autorizado para este ticket.' }));

    await assert.rejects(service.list(29), /No autorizado para este ticket\./);
});
