const test = require('node:test');
const assert = require('node:assert/strict');
const { fingerprint } = require('../backend/utils/idempotency');
const requireIdempotencyKey = require('../backend/middleware/idempotencyKey');

test('fingerprints are stable across object key order and differ when payload changes', () => {
    assert.equal(fingerprint({ a: 1, b: { x: 2, y: 3 } }), fingerprint({ b: { y: 3, x: 2 }, a: 1 }));
    assert.notEqual(fingerprint({ a: 1 }), fingerprint({ a: 2 }));
});

test('idempotency middleware rejects missing and malformed keys', () => {
    for (const value of [undefined, 'short', 'bad key value!']) {
        let status;
        let response;
        const req = { get: () => value };
        const res = {
            status(code) { status = code; return this; },
            json(body) { response = body; return this; }
        };
        let continued = false;
        requireIdempotencyKey(req, res, () => { continued = true; });
        assert.equal(status, 400);
        assert.match(response.error, /Idempotency-Key/);
        assert.equal(continued, false);
    }
});

test('idempotency middleware attaches an accepted key to the request', () => {
    const req = { get: () => 'a-valid-client-request-id-1234' };
    let continued = false;
    requireIdempotencyKey(req, {}, () => { continued = true; });
    assert.equal(continued, true);
    assert.equal(req.idempotencyKey, 'a-valid-client-request-id-1234');
});
