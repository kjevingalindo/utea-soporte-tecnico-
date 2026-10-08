const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const verificarToken = require('../middleware/authMiddleware');
const { verificarRol } = require('../middleware/roleMiddleware');

require('dotenv').config({ path: '../.env' });
const SECRET = process.env.JWT_SECRET;
const PROTECTED_ADMIN_USERNAME = (process.env.ADMIN_USERNAME || 'admin').trim();

async function ensureDefaultAdmin() {
    const username = (process.env.ADMIN_USERNAME || 'admin').trim();
    const password = process.env.ADMIN_PASSWORD || 'admin123';

    if (!username || !password) return;

    try {
        const [existing] = await db.promise().query('SELECT id FROM usuarios WHERE username = ? LIMIT 1', [username]);
        if (existing.length > 0) {
            return;
        }

        const hashed = await bcrypt.hash(password, 10);
        await db.promise().query('INSERT INTO usuarios (username, password, rol) VALUES (?, ?, ?)', [username, hashed, 'admin']);
        console.log(`Usuario administrador creado: ${username}`);
    } catch (error) {
        console.error('Error creando admin por defecto:', error.message);
    }
}

function validarUsuario(username, password) {
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
        return 'Usuario y contraseña son obligatorios';
    }

    if (username.trim().length < 3) {
        return 'El usuario debe tener al menos 3 caracteres';
    }

    if (password.length < 6) {
        return 'La contraseña debe tener al menos 6 caracteres';
    }

    return null;
}

//registro de usuarios normales
router.post('/register', async (req, res) => {
    const { username, password, rol } = req.body;
    const error = validarUsuario(username, password);

    if (error) {
        return res.status(400).json({ error });
    }

    const rolAsignado = ['estudiante', 'docente', 'administrativo', 'usuario'].includes(rol) ? rol : 'estudiante';

    try {
        const hashed = await bcrypt.hash(password, 10);
        const sql = 'INSERT INTO usuarios (username, password, rol) VALUES (?, ?, ?)';

        db.query(sql, [username.trim(), hashed, rolAsignado], (err) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(400).json({ error: 'El usuario ya existe' });
                }
                return res.status(500).json({ error: 'Error al registrar usuario' });
            }

            res.json({ mensaje: 'Usuario registrado correctamente' });
        });
    } catch (err) {
        res.status(500).json({ error: 'Error al registrar usuario' });
    }
});

//crear admin desde backend o panel de administración
router.post('/admin', verificarToken, verificarRol('admin'), async (req, res) => {
    const { username, password, rol = 'admin', nombre_completo, correo_institucional, oficina_id } = req.body || {};
    const error = validarUsuario(username, password);

    if (error) {
        return res.status(400).json({ error });
    }

    const nombreNormalizado = typeof nombre_completo === 'string' ? nombre_completo.trim() : '';
    const correoNormalizado = typeof correo_institucional === 'string' ? correo_institucional.trim().toLowerCase() : '';
    if (!nombreNormalizado || nombreNormalizado.length > 150) {
        return res.status(400).json({ error: 'El nombre completo es obligatorio y debe tener como máximo 150 caracteres' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoNormalizado) || correoNormalizado.length > 254) {
        return res.status(400).json({ error: 'El correo institucional no es válido' });
    }
    if (!['admin', 'usuario'].includes(rol)) {
        return res.status(400).json({ error: 'Rol no válido' });
    }
    if (!/^\d+$/.test(String(oficina_id)) || Number(oficina_id) < 1) {
        return res.status(400).json({ error: 'La oficina es obligatoria' });
    }

    try {
        const hashed = await bcrypt.hash(password, 10);

        db.query('SELECT id FROM oficinas WHERE id = ? AND activo = TRUE', [Number(oficina_id)], (errOffice, offices) => {
            if (errOffice) return res.status(500).json({ error: 'Error validando oficina' });
            if (!offices.length) return res.status(400).json({ error: 'La oficina no existe o está inactiva' });

            db.query('INSERT INTO usuarios (username, password, rol, nombre_completo, correo_institucional, oficina_id) VALUES (?, ?, ?, ?, ?, ?)',
                [username.trim(), hashed, rol, nombreNormalizado, correoNormalizado, Number(oficina_id)], (errInsert, result) => {
                    if (errInsert) {
                        if (errInsert.code === 'ER_DUP_ENTRY') {
                            return res.status(409).json({ error: 'El usuario o correo institucional ya existe' });
                        }
                        console.error('Error al crear usuario administrativo:', errInsert.message);
                        return res.status(500).json({ error: 'Error al crear usuario' });
                    }

                    res.status(201).json({ id: result.insertId, mensaje: 'Usuario creado correctamente' });
                }
            );
        });
    } catch (err) {
        res.status(500).json({ error: 'Error al crear administrador' });
    }
});

const ROLES_VALIDOS = ['superadmin', 'admin', 'tecnico', 'administrativo', 'estudiante', 'docente', 'usuario'];

//listar usuarios, solo admin/superadmin
router.get('/usuarios', verificarToken, verificarRol('admin', 'superadmin'), (req, res) => {
    db.query(`SELECT u.id, u.username, u.rol, u.nombre_completo, u.correo_institucional, o.nombre AS oficina_nombre,
                     (u.username = ?) AS is_protected_admin
              FROM usuarios u
              LEFT JOIN oficinas o ON o.id = u.oficina_id
              ORDER BY u.id ASC`, [PROTECTED_ADMIN_USERNAME], (err, results) => {
        if (err) return res.status(500).json({ error: 'Error obteniendo usuarios' });
        res.json(results);
    });
});

//actualizar rol de usuario
router.patch('/usuarios/:id/rol', verificarToken, verificarRol('admin', 'superadmin'), (req, res) => {
    const { id } = req.params;
    const { rol } = req.body || {};

    if (!ROLES_VALIDOS.includes(rol)) {
        return res.status(400).json({ error: 'Rol no válido. Opciones: superadmin, admin, tecnico, administrativo, estudiante, docente, usuario' });
    }

    db.query('SELECT id, username, rol FROM usuarios WHERE id = ?', [id], (err, results) => {
        if (err) return res.status(500).json({ error: 'Error buscando usuario' });
        if (!results.length) return res.status(404).json({ error: 'Usuario no encontrado' });

        if (Number(id) === req.user.id) {
            return res.status(400).json({ error: 'No puedes cambiar tu propio rol' });
        }

        if (results[0].username === PROTECTED_ADMIN_USERNAME && rol !== 'admin' && rol !== 'superadmin') {
            return res.status(403).json({ error: 'La cuenta principal debe conservar sus privilegios de administrador' });
        }

        db.query('UPDATE usuarios SET rol = ? WHERE id = ?', [rol, id], (updateErr) => {
            if (updateErr) return res.status(500).json({ error: 'Error actualizando rol' });
            res.json({ mensaje: 'Rol actualizado' });
        });
    });
});

router.get('/me', verificarToken, (req, res) => {
    res.json({
        id: req.user.id,
        username: req.user.username,
        rol: req.user.rol
    });
});

router.get('/me/profile', verificarToken, (req, res) => {
    db.query(`SELECT u.id, u.username, u.rol, u.nombre_completo, u.correo_institucional,
                     o.nombre AS oficina_nombre
              FROM usuarios u
              LEFT JOIN oficinas o ON o.id = u.oficina_id
              WHERE u.id = ?`, [req.user.id], (err, results) => {
        if (err) {
            console.error('Error obteniendo el perfil del usuario:', err.message);
            return res.status(500).json({ error: 'Error obteniendo el perfil' });
        }
        if (!results.length) return res.status(404).json({ error: 'Usuario no encontrado' });
        res.json(results[0]);
    });
});

router.put('/me/profile', verificarToken, (req, res) => {
    const profile = req.body;
    const allowedFields = ['nombre_completo', 'correo_institucional'];
    if (!profile || typeof profile !== 'object' || Array.isArray(profile) ||
        !Object.hasOwn(profile, 'nombre_completo') ||
        !Object.hasOwn(profile, 'correo_institucional') ||
        Object.keys(profile).some(field => !allowedFields.includes(field))) {
        return res.status(400).json({ error: 'Debes enviar nombre completo y correo institucional para actualizar el perfil' });
    }

    const updates = [];
    const values = [];
    if (Object.hasOwn(profile, 'nombre_completo')) {
        if (typeof profile.nombre_completo !== 'string') {
            return res.status(400).json({ error: 'El nombre completo no es válido' });
        }
        const nombre = profile.nombre_completo.trim();
        if (!nombre || nombre.length > 150) {
            return res.status(400).json({ error: 'El nombre completo es obligatorio y debe tener como máximo 150 caracteres' });
        }
        updates.push('nombre_completo = ?');
        values.push(nombre);
    }
    if (Object.hasOwn(profile, 'correo_institucional')) {
        if (typeof profile.correo_institucional !== 'string') {
            return res.status(400).json({ error: 'El correo institucional no es válido' });
        }
        const correo = profile.correo_institucional.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) || correo.length > 254) {
            return res.status(400).json({ error: 'El correo institucional no es válido' });
        }
        updates.push('correo_institucional = ?');
        values.push(correo);
    }

    values.push(req.user.id);
    db.query(`UPDATE usuarios SET ${updates.join(', ')} WHERE id = ?`, values, (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ error: 'El correo institucional ya está registrado' });
            }
            console.error('Error actualizando el perfil del usuario:', err.message);
            return res.status(500).json({ error: 'Error actualizando el perfil' });
        }
        res.json({ mensaje: 'Perfil actualizado correctamente' });
    });
});

router.patch('/me/password', verificarToken, async (req, res) => {
    const { current_password, new_password } = req.body || {};
    if (Object.keys(req.body || {}).some(field => !['current_password', 'new_password'].includes(field))) {
        return res.status(400).json({ error: 'La solicitud contiene campos no permitidos' });
    }
    if (typeof current_password !== 'string' || !current_password ||
        typeof new_password !== 'string' || !new_password) {
        return res.status(400).json({ error: 'La contraseña actual y la nueva son obligatorias' });
    }
    if (new_password.length < 6) {
        return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres' });
    }

    try {
        const [users] = await db.promise().query('SELECT password FROM usuarios WHERE id = ?', [req.user.id]);
        if (!users.length) return res.status(404).json({ error: 'Usuario no encontrado' });
        if (!(await bcrypt.compare(current_password, users[0].password))) {
            return res.status(400).json({ error: 'La contraseña actual es incorrecta' });
        }
        const hashedPassword = await bcrypt.hash(new_password, 10);
        const [result] = await db.promise().query('UPDATE usuarios SET password = ? WHERE id = ?', [hashedPassword, req.user.id]);
        if (!result.affectedRows) return res.status(404).json({ error: 'Usuario no encontrado' });
        res.json({ mensaje: 'Contraseña actualizada correctamente' });
    } catch (error) {
        console.error('Error actualizando la contraseña del usuario:', error.message);
        res.status(500).json({ error: 'Error actualizando la contraseña' });
    }
});

//eliminar usuario, solo admin
router.delete('/usuarios/:id', verificarToken, verificarRol('admin'), (req, res) => {
    const { id } = req.params;

    if (Number(id) === req.user.id) {
        return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
    }

    db.query('DELETE FROM usuarios WHERE id = ? AND rol = ? AND username <> ?', [id, 'usuario', PROTECTED_ADMIN_USERNAME], (err, result) => {
        if (err) return res.status(500).json({ error: 'Error eliminando usuario' });
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado o no es posible eliminarlo' });
        }
        res.json({ mensaje: 'Usuario eliminado' });
    });
});

//login
router.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Usuario y contraseña son obligatorios' });
    }

    db.query('SELECT * FROM usuarios WHERE username = ?', [username.trim()], async (err, results) => {
        if (err) return res.status(500).json({ error: 'Error en la consulta' });

        if (results.length === 0) {
            return res.status(400).json({ error: 'Usuario no existe' });
        }

        const user = results[0];
        const match = await bcrypt.compare(password, user.password);

        if (!match) {
            return res.status(400).json({ error: 'Constraseña incorrecta' });
        }

        const userRole = user.rol || 'usuario';
        const token = jwt.sign({ id: user.id, username: user.username, rol: userRole }, SECRET, { expiresIn: '2h' });

        res.json({ token, username: user.username, rol: userRole });
    });
});

module.exports = router;
module.exports.ensureDefaultAdmin = ensureDefaultAdmin;