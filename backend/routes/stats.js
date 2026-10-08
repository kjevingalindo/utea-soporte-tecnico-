const express = require('express');
const router = express.Router();
const db = require('../db');
const verificarToken = require('../middleware/authMiddleware');
const { verificarRol } = require('../middleware/roleMiddleware');
const { canViewReports } = require('../utils/accessControl');
const { getDashboardSummary, getPersonalDashboardSummary } = require('../services/statsService');

function monthWindowInLima() {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Lima',
        year: 'numeric',
        month: '2-digit'
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    const [year, month] = [Number(values.year), Number(values.month)];
    const start = new Date(Date.UTC(year, month - 6, 1, 5));
    const end = new Date(Date.UTC(year, month, 1, 5));
    return {
        startEpoch: Math.floor(start.getTime() / 1000),
        endEpoch: Math.floor(end.getTime() / 1000)
    };
}

router.get('/me', verificarToken, async (req, res) => {
    try {
        const summary = await getPersonalDashboardSummary(req.user.id);
        res.json(summary);
    } catch (err) {
        console.error('Error calculando el resumen personal:', err);
        res.status(500).json({ error: 'Error al generar el resumen personal' });
    }
});

router.get('/', verificarToken, (req, res, next) => {
    if (!canViewReports(req.user)) {
        return res.status(403).json({ error: 'No tienes permiso para consultar las estadísticas institucionales' });
    }
    next();
}, async (req, res) => {
    try {
        const summary = await getDashboardSummary();
        res.json(summary);
    } catch (err) {
        console.error('Error calculando KPIs de estadísticas:', err);
        res.status(500).json({ error: 'Error al generar los KPIs del sistema' });
    }
});

module.exports = router;
