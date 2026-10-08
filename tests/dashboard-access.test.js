const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

const users = new Map([
    [1, { id: 1, username: 'admin-ficticio', rol: 'admin' }],
    [101, { id: 101, username: 'solicitante-administrativo', rol: 'administrativo' }],
    [202, { id: 202, username: 'solicitante-docente', rol: 'docente' }]
]);
const tickets = [
    { user_id: 101, estado: 'Creado', prioridad: 'Alta' },
    { user_id: 101, estado: 'Cerrado', prioridad: 'Media' },
    { user_id: 202, estado: 'En proceso', prioridad: 'Urgente' },
    { user_id: 202, estado: 'Solucionado', prioridad: 'Baja' },
    { user_id: 202, estado: 'Clasificado', prioridad: 'Media' }
];
const accountIncidentsByUser = new Map([[101, 2], [202, 1]]);

function rows(result) {
    return [result, []];
}

const mockDb = {
    query(sql, params, callback) {
        if (sql.includes('SELECT id, username, rol FROM usuarios WHERE id = ?')) {
            const user = users.get(Number(params[0]));
            callback(null, user ? [user] : []);
            return;
        }
        if (sql.includes('FROM usuarios u')) {
            callback(null, [...users.values()]);
            return;
        }
        callback(new Error(`Unexpected test query: ${sql}`));
    },
    promise() {
        return {
            async query(sql) {
                if (sql.includes('SELECT COUNT(*) AS total FROM tickets')) {
                    return rows([{ total: tickets.length }]);
                }
                if (sql.includes('SELECT estado, COUNT(*) AS cantidad FROM tickets')) {
                    const counts = new Map();
                    tickets.forEach(ticket => counts.set(ticket.estado, (counts.get(ticket.estado) || 0) + 1));
                    return rows([...counts].map(([estado, cantidad]) => ({ estado, cantidad })));
                }
                if (sql.includes('AS criticos')) {
                    return rows([{
                        criticos: tickets.filter(ticket =>
                            ['Alta', 'Urgente', 'Critica'].includes(ticket.prioridad) &&
                            !['Solucionado', 'Cerrado'].includes(ticket.estado)
                        ).length
                    }]);
                }
                if (sql.includes('AVG(calificacion)')) {
                    return rows([{ promedio: null, conteo: 0 }]);
                }
                if (sql.includes('primeraRespuestaPromedioHoras')) {
                    return rows([{ primeraRespuestaPromedioHoras: null }]);
                }
                if (sql.includes('tiempoPromedioHoras')) {
                    return rows([{ tiempoPromedioHoras: null }]);
                }
                if (sql.includes('cumplimientoSlaRespuestaPct')) {
                    return rows([{ cumplimientoSlaRespuestaPct: null }]);
                }
                if (sql.includes('cumplimientoSlaResolucionPct')) {
                    return rows([{ cumplimientoSlaResolucionPct: null }]);
                }
                throw new Error(`Unexpected test query: ${sql}`);
            },
            async execute(sql, params) {
                if (sql.includes('FROM tickets') && sql.includes('WHERE user_id = ?')) {
                    const ownTickets = tickets.filter(ticket => ticket.user_id === Number(params[0]));
                    const closed = ownTickets.filter(ticket => ['Solucionado', 'Cerrado'].includes(ticket.estado)).length;
                    return rows([{
                        total: ownTickets.length,
                        pendientes: ownTickets.filter(ticket => ['Creado', 'Clasificado', 'Asignado'].includes(ticket.estado)).length,
                        enProceso: ownTickets.filter(ticket => ['En proceso', 'Esperando usuario'].includes(ticket.estado)).length,
                        solucionados: closed,
                        criticos: ownTickets.filter(ticket =>
                            ['Alta', 'Urgente', 'Critica'].includes(ticket.prioridad) &&
                            !['Solucionado', 'Cerrado'].includes(ticket.estado)
                        ).length
                    }]);
                }
                if (sql.includes('FROM incidencias_cuentas WHERE usuario_id = ?')) {
                    return rows([{ incidenciasCuentas: accountIncidentsByUser.get(Number(params[0])) || 0 }]);
                }
                if (sql.includes('DATE_FORMAT(COALESCE')) return rows([]);
                throw new Error(`Unexpected test query: ${sql}`);
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
process.env.JWT_SECRET = 'dashboard-access-test-secret';

const statsRoutes = require('../backend/routes/stats');
const authRoutes = require('../backend/routes/auth');

test('backend dashboard endpoints isolate requesters and reserve global views for staff', async t => {
    const app = express();
    app.use(express.json());
    app.use('/api/stats', statsRoutes);
    app.use('/api/auth', authRoutes);

    const server = app.listen(0);
    t.after(() => {
        server.close();
        if (originalDbCacheEntry) require.cache[dbPath] = originalDbCacheEntry;
        else delete require.cache[dbPath];
    });

    await new Promise(resolve => server.once('listening', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const tokenFor = (id, staleRole) => jwt.sign({ id, rol: staleRole }, process.env.JWT_SECRET);
    const request = (path, id, staleRole) => fetch(`${baseUrl}${path}`, {
        headers: { Authorization: `Bearer ${tokenFor(id, staleRole)}` }
    });

    const identityResponse = await request('/api/auth/me', 101, 'admin');
    assert.equal(identityResponse.status, 200);
    assert.deepEqual(await identityResponse.json(), {
        id: 101,
        username: 'solicitante-administrativo',
        rol: 'administrativo'
    });

    const firstSummaryResponse = await request('/api/stats/me?user_id=202', 101, 'admin');
    const firstSummary = await firstSummaryResponse.json();
    assert.equal(firstSummaryResponse.status, 200);
    assert.deepEqual(
        [firstSummary.total, firstSummary.pendientes, firstSummary.enProceso, firstSummary.solucionados, firstSummary.incidenciasCuentas],
        [2, 1, 0, 1, 2]
    );

    const secondSummaryResponse = await request('/api/stats/me?user_id=101', 202, 'usuario');
    const secondSummary = await secondSummaryResponse.json();
    assert.equal(secondSummaryResponse.status, 200);
    assert.deepEqual(
        [secondSummary.total, secondSummary.pendientes, secondSummary.enProceso, secondSummary.solucionados, secondSummary.incidenciasCuentas],
        [3, 1, 1, 1, 1]
    );

    assert.equal((await request('/api/stats', 101, 'admin')).status, 403);
    assert.equal((await request('/api/auth/usuarios', 202, 'admin')).status, 403);

    const adminSummaryResponse = await request('/api/stats', 1, 'usuario');
    const adminSummary = await adminSummaryResponse.json();
    assert.equal(adminSummaryResponse.status, 200);
    assert.equal(adminSummary.total, tickets.length);

    const adminUsersResponse = await request('/api/auth/usuarios', 1, 'usuario');
    assert.equal(adminUsersResponse.status, 200);
});
