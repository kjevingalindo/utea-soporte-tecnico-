const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const users = new Map([
    [101, {
        id: 101,
        username: 'solicitante-uno',
        rol: 'administrativo',
        nombre_completo: 'Solicitante Uno',
        correo_institucional: 'uno@example.edu',
        oficina_nombre: 'Oficina Uno',
        password: bcrypt.hashSync('clave-actual-uno', 10)
    }],
    [202, {
        id: 202,
        username: 'solicitante-dos',
        rol: 'docente',
        nombre_completo: 'Solicitante Dos',
        correo_institucional: 'dos@example.edu',
        oficina_nombre: 'Oficina Dos',
        password: bcrypt.hashSync('clave-actual-dos', 10)
    }]
]);

const mockDb = {
    query(sql, params, callback) {
        if (sql.includes('SELECT id, username, rol FROM usuarios WHERE id = ?')) {
            const user = users.get(Number(params[0]));
            callback(null, user ? [{ id: user.id, username: user.username, rol: user.rol }] : []);
            return;
        }
        if (sql.includes('LEFT JOIN oficinas')) {
            const user = users.get(Number(params[0]));
            callback(null, user ? [{
                id: user.id,
                username: user.username,
                rol: user.rol,
                nombre_completo: user.nombre_completo,
                correo_institucional: user.correo_institucional,
                oficina_nombre: user.oficina_nombre
            }] : []);
            return;
        }
        if (sql.startsWith('UPDATE usuarios SET')) {
            const userId = Number(params.at(-1));
            const user = users.get(userId);
            if (user) {
                params.slice(0, -1).forEach((value, index) => {
                    const field = sql.includes('nombre_completo = ?')
                        ? (index === 0 ? 'nombre_completo' : 'correo_institucional')
                        : 'correo_institucional';
                    user[field] = value;
                });
            }
            callback(null, { affectedRows: user ? 1 : 0 });
            return;
        }
        callback(new Error(`Unexpected test query: ${sql}`));
    },
    promise() {
        return {
            async query(sql, params) {
                const user = users.get(Number(params.at(-1)));
                if (sql === 'SELECT password FROM usuarios WHERE id = ?') {
                    return [user ? [{ password: user.password }] : [], []];
                }
                if (sql === 'UPDATE usuarios SET password = ? WHERE id = ?') {
                    if (!user) return [{ affectedRows: 0 }, []];
                    user.password = params[0];
                    return [{ affectedRows: 1 }, []];
                }
                throw new Error(`Unexpected test promise query: ${sql}`);
            }
        };
    }
};

const dbPath = require.resolve('../backend/db');
const originalDbCacheEntry = require.cache[dbPath];
require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: mockDb
};
process.env.JWT_SECRET = 'user-profile-test-secret';

const authRoutes = require('../backend/routes/auth');

test('authenticated users can only read and update their own permitted profile fields', async t => {
    const app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);
    const server = app.listen(0);
    t.after(() => {
        server.close();
        if (originalDbCacheEntry) require.cache[dbPath] = originalDbCacheEntry;
        else delete require.cache[dbPath];
    });
    await new Promise(resolve => server.once('listening', resolve));

    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const tokenFor = id => jwt.sign({ id, rol: 'admin' }, process.env.JWT_SECRET);
    const request = (path, id, options = {}) => fetch(`${baseUrl}${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${tokenFor(id)}`,
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...options.headers
        }
    });

    const firstProfileResponse = await request('/api/auth/me/profile', 101);
    assert.equal(firstProfileResponse.status, 200);
    assert.equal((await firstProfileResponse.json()).nombre_completo, 'Solicitante Uno');
    const secondProfileResponse = await request('/api/auth/me/profile', 202);
    assert.equal((await secondProfileResponse.json()).nombre_completo, 'Solicitante Dos');

    const updateResponse = await request('/api/auth/me/profile', 101, {
        method: 'PUT',
        body: JSON.stringify({
            nombre_completo: 'Nombre Actualizado',
            correo_institucional: 'actualizado@example.edu'
        })
    });
    assert.equal(updateResponse.status, 200);
    assert.equal(users.get(101).nombre_completo, 'Nombre Actualizado');
    assert.equal(users.get(101).correo_institucional, 'actualizado@example.edu');
    assert.equal(users.get(202).nombre_completo, 'Solicitante Dos');
    assert.equal(users.get(202).correo_institucional, 'dos@example.edu');

    const forbiddenFieldsResponse = await request('/api/auth/me/profile', 101, {
        method: 'PUT',
        body: JSON.stringify({ nombre_completo: 'No permitido', rol: 'admin', id: 202 })
    });
    assert.equal(forbiddenFieldsResponse.status, 400);
    assert.equal(users.get(101).rol, 'administrativo');
    assert.equal(users.get(202).nombre_completo, 'Solicitante Dos');

    const incorrectPasswordResponse = await request('/api/auth/me/password', 101, {
        method: 'PATCH',
        body: JSON.stringify({ current_password: 'incorrecta', new_password: 'clave-nueva' })
    });
    assert.equal(incorrectPasswordResponse.status, 400);
    assert.equal(await bcrypt.compare('clave-actual-uno', users.get(101).password), true);

    const passwordResponse = await request('/api/auth/me/password', 101, {
        method: 'PATCH',
        body: JSON.stringify({ current_password: 'clave-actual-uno', new_password: 'clave-nueva-uno' })
    });
    assert.equal(passwordResponse.status, 200);
    assert.equal(await bcrypt.compare('clave-nueva-uno', users.get(101).password), true);
    assert.equal(await bcrypt.compare('clave-actual-dos', users.get(202).password), true);
});
