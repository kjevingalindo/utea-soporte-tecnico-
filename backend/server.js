require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');

const app = express();
const http = require('http');
const httpServer = http.createServer(app);
const { Server } = require('socket.io');

const io = new Server(httpServer, {
    cors: { origin: '*' }
});

module.exports.io = io;

io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Token requerido'));
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) return next(new Error('Token invalido'));
        socket.user = decoded;
        next();
    });
});

io.on('connection', (socket) => {
    if (socket.user && socket.user.id) {
        socket.join('user_' + socket.user.id);
    }
});

app.use(cors());
app.use(express.json());

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, '../frontend')));

const authRoutes = require('./routes/auth');
authRoutes.ensureDefaultAdmin?.();
app.use('/api/auth', authRoutes);

const ticketRoutes = require('./routes/tickets');
app.use('/api/tickets', ticketRoutes);

const tecnicosRoutes = require('./routes/tecnicos');
const statsRoutes = require('./routes/stats');
const commentsRoutes = require('./routes/comments');
const notificationsRoutes = require('./routes/notifications');
const catalogosRoutes = require('./routes/catalogos');
const adjuntosRoutes = require('./routes/adjuntos');
const diagnosticosRoutes = require('./routes/diagnosticos');
const cuentasRoutes = require('./routes/cuentas.routes');
const errorHandler = require('./middleware/errorHandler');

app.use('/api/tecnicos', tecnicosRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/comentarios', commentsRoutes);
app.use('/api/notificaciones', notificationsRoutes);
app.use('/api/catalogos', catalogosRoutes);
app.use('/api/adjuntos', adjuntosRoutes);
app.use('/api/diagnosticos', diagnosticosRoutes);
app.use('/api/cuentas', cuentasRoutes);
app.use(errorHandler);

const PORT = Number(process.env.PORT || 3000);
httpServer.listen(PORT, function() {
    console.log('Servidor corriendo en http://localhost:' + PORT);
});
