const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createClient(fetchImpl) {
    const context = {
        window: {
            UTEAConfig: { defaultTimeoutMs: 1000, apiBaseUrl: '' },
            localStorage: { getItem: () => 'test-token' },
            fetch: fetchImpl,
            setTimeout,
            clearTimeout
        },
        Headers,
        AbortController,
        URLSearchParams,
        setTimeout,
        clearTimeout,
        console
    };
    vm.createContext(context);
    const filePath = path.join(__dirname, '..', 'frontend', 'js', 'api', 'httpClient.js');
    vm.runInContext(fs.readFileSync(filePath, 'utf8'), context);
    return context.window.UTEAHttpClient;
}

test('HTTP client sends concurrent writes independently and normalizes methods', async () => {
    const requests = [];
    const client = createClient((url, options) => {
        requests.push({ url, options });
        return Promise.resolve(new Response('{}', { status: 200 }));
    });

    await Promise.all([
        client.put('/api/profile', { name: 'First' }),
        client.request('/api/profile', { method: 'pUt', body: '{"name":"Second"}' })
    ]);

    assert.equal(requests.length, 2);
    assert.deepEqual(requests.map(request => request.options.method), ['PUT', 'PUT']);
    assert.deepEqual(requests.map(request => request.options.body), ['{"name":"First"}', '{"name":"Second"}']);
});

test('concurrent GET responses have independently readable bodies', async () => {
    let count = 0;
    const client = createClient(() => Promise.resolve(new Response(
        JSON.stringify({ request: ++count }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
    )));
    const [first, second] = await Promise.all([
        client.get('/api/tickets'),
        client.get('/api/tickets')
    ]);

    assert.notEqual(first, second);
    assert.deepEqual(await first.json(), { request: 1 });
    assert.deepEqual(await second.json(), { request: 2 });
});
