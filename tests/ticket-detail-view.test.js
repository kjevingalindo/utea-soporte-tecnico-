const test = require('node:test');
const assert = require('node:assert/strict');
const view = require('../frontend/js/components/ticketDetailView');

test('ticket detail summary preserves context fields and escapes user-provided text', () => {
    const html = view.renderSummary({
        titulo: '<img src=x onerror=alert(1)>',
        prioridad: 'Media',
        estado: 'Asignado',
        solicitante_nombre: 'A <script>alert(1)</script>',
        oficina_nombre: 'Oficina <b>Admin</b>',
        categoria_nombre: 'Internet',
        bloque: 'B',
        ambiente: 'A-2',
        aula: '14',
        descripcion: 'Primera línea\n<script>no</script>',
        ubicacion: 'Campus'
    }, {
        escapeHTML: value => String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[character]),
        getPriorityClass: () => 'priority',
        getStateClass: () => 'state',
        getSlaDetailsHTML: () => 'Indicador SLA'
    });

    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(html, /Oficina &lt;b&gt;Admin&lt;\/b&gt;/);
    assert.match(html, /Bloque: B<br>Ambiente: A-2<br>Aula: 14/);
    assert.match(html, /Primera línea\n&lt;script&gt;no&lt;\/script&gt;/);
    assert.doesNotMatch(html, /<script>/);
});
