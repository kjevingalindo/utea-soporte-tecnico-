function requireIdempotencyKey(req, res, next) {
    const value = req.get('Idempotency-Key');
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(value)) {
        return res.status(400).json({ error: 'Se requiere una clave Idempotency-Key válida para crear el registro' });
    }
    req.idempotencyKey = value;
    next();
}

module.exports = requireIdempotencyKey;
