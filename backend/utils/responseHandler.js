function success(res, data, message = 'Operación completada correctamente', status = 200) {
    return res.status(status).json({
        success: true,
        message,
        data
    });
}

function error(res, message = 'Error interno del servidor', status = 500) {
    return res.status(status).json({
        success: false,
        error: message
    });
}

module.exports = { success, error };
