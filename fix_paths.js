const fs = require('fs');
const baseURL = "const API_URL = window.location.hostname ? 'http://' + window.location.hostname + ':3000' : 'http://localhost:3000';\n\n";
const files = ['app.js', 'login.js', 'notifications.js', 'dashboard.js', 'calendar.js'];

files.forEach(f => {
    const p = 'D:/Cursos o intentos de programacion/Proyectos de portafolio/sistema-tickets/frontend/' + f;
    try {
        let c = fs.readFileSync(p, 'utf8');
        
        // Remove existing API_URL if it's there
        if (!c.includes('const API_URL')) {
            c = baseURL + c;
        }

        // Replace all variants of paths backwards and forwards
        c = c.replace(/fetch\('http:\/\/localhost:3000\/api\//g, "fetch(API_URL + '/api/");
        c = c.replace(/fetch\('\/api\//g, "fetch(API_URL + '/api/");
        // For template literals: `http://localhost:3000/api/...`
        c = c.replace(/fetch\(`http:\/\/localhost:3000\/api\//g, "fetch(`${API_URL}/api/");
        c = c.replace(/fetch\(`\/api\//g, "fetch(`${API_URL}/api/");

        // For socket io
        c = c.replace(/io\('http:\/\/localhost:3000'/g, "io(API_URL");
        c = c.replace(/io\(''/g, "io(API_URL");

        fs.writeFileSync(p, c);
        console.log('Fixed ' + f);
    } catch (e) {
        console.log('Skipping ' + f + ' ' + e.message);
    }
});
