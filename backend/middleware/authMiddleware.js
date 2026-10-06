const jwt = require('jsonwebtoken');
const db = require('../db');

const SECRET = process.env.JWT_SECRET;

function verificarToken(req, res, next) {
    
    const authHeader = req.headers['authorization'];

    const token = authHeader && authHeader.split(' ')[1];

    if(!token) {
        return res.status(401).json({ error: 'Token requerido' });
    }

    jwt.verify(token, SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Token invalido' });
        }
        
        // Consultar usuario en BD para obtener rol actualizado
        db.query('SELECT id, username, rol FROM usuarios WHERE id = ?', [user.id], (err, results) => {
            if (err || results.length === 0) {
                return res.status(401).json({ error: 'Usuario no encontrado' });
            }
            
            req.user = {
                id: results[0].id,
                username: results[0].username,
                rol: results[0].rol || 'usuario'
            };
            next();
        });
    });
}

module.exports = verificarToken;