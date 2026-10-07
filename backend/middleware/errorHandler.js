const fs = require('fs');
const path = require('path');
const { error } = require('../utils/responseHandler');

function errorHandler(err, req, res, next) {
    if (res.headersSent) return next(err);

    const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600
        ? err.status
        : err.type === 'entity.too.large' || err.code === 'LIMIT_FILE_SIZE'
            ? 413
            : 500;
    const message = status === 500
        ? 'Ocurrió un error interno al procesar la solicitud'
        : err.message || 'No se pudo procesar la solicitud';

    if (status >= 500) {
        console.error('Error de solicitud:', err.stack || err.message);
        const logEntry = `[${new Date().toISOString()}] ${req.method} ${req.originalUrl}\n${err.stack || err.message}\n\n`;
        fs.appendFile(path.resolve(__dirname, '../crash.log'), logEntry, { encoding: 'utf16le' }, logError => {
            if (logError) console.error('No se pudo registrar el error en crash.log:', logError.message);
        });
    }
    return error(res, message, status);
}

module.exports = errorHandler;
