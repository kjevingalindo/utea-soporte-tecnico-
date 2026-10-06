// Sistema de mensajes visuales (toast)
function mostrarMensaje(mensaje, tipo = 'info') {
    const contenedor = document.getElementById('mensajes');
    if (!contenedor) return;

    const toast = document.createElement('div');
    toast.className = 'toast toast-' + tipo;
    toast.textContent = mensaje;
    
    let bgColor = '#2196F3';
    if (tipo === 'error') bgColor = '#f44336';
    if (tipo === 'exito') bgColor = '#4CAF50';
    
    toast.style.cssText = 
        'position: fixed;' +
        'top: 20px;' +
        'right: 20px;' +
        'padding: 15px 20px;' +
        'border-radius: 5px;' +
        'color: white;' +
        'font-weight: bold;' +
        'z-index: 9999;' +
        'margin-bottom: 10px;' +
        'background-color: ' + bgColor + ';' +
        'animation: slideIn 0.3s ease;';

    contenedor.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Función para mostrar/ocultar loading
function mostrarLoading(mostrar, elemento = null) {
    // Remover loading anterior si existe
    const existingLoading = document.getElementById('loading-overlay');
    if (existingLoading) existingLoading.remove();
    
    if (mostrar) {
        const overlay = document.createElement('div');
        overlay.id = 'loading-overlay';
        overlay.style.cssText = 
            'position: fixed;' +
            'top: 0;' +
            'left: 0;' +
            'width: 100%;' +
            'height: 100%;' +
            'background: rgba(0,0,0,0.5);' +
            'z-index: 9998;' +
            'display: flex;' +
            'justify-content: center;' +
            'align-items: center;';
        
        const spinner = document.createElement('div');
        spinner.textContent = 'Cargando...';
        spinner.style.cssText = 
            'background: white;' +
            'padding: 20px 40px;' +
            'border-radius: 8px;' +
            'font-weight: bold;' +
            'color: #333;';
        
        overlay.appendChild(spinner);
        document.body.appendChild(overlay);
        
        // Deshabilitar elemento si se pasa
        if (elemento) elemento.disabled = true;
    } else {
        // Habilitar elemento si se pasa
        if (elemento) elemento.disabled = false;
    }
}

// Agregar estilos CSS para animaciones
const style = document.createElement('style');
style.textContent = 
    '@keyframes slideIn {' +
    '    from { transform: translateX(400px); opacity: 0; }' +
    '    to { transform: translateX(0); opacity: 1; }' +
    '}' +
    '@keyframes slideOut {' +
    '    from { transform: translateX(0); opacity: 1; }' +
    '    to { transform: translateX(400px); opacity: 0; }' +
    '}' +
    '.toast {' +
    '    animation: slideIn 0.3s ease;' +
    '}';
document.head.appendChild(style);
