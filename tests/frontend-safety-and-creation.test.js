const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const safeText = require('../frontend/js/components/safeText');
const ticketForm = require('../frontend/js/ticketForm');

class Element {
    constructor(ownerDocument) {
        this.ownerDocument = ownerDocument;
        this.children = [];
        this.textContent = '';
        this.innerHTML = '';
        this.style = {};
    }

    appendChild(child) {
        this.children.push(child);
        return child;
    }

    replaceChildren(...children) {
        this.children = children;
    }
}

test('user-controlled markup and line breaks are inserted as text, not parsed HTML', () => {
    const document = { createElement: () => new Element(document) };
    const parent = new Element(document);
    const value = '<img src=x onerror=alert(1)>\nLínea & texto';
    const node = safeText.append(parent, 'p', value, 'comment');

    assert.equal(node.textContent, value);
    assert.equal(node.innerHTML, '');
    assert.equal(node.className, 'comment');
    assert.equal(parent.children[0], node);
});

test('shared escaping helper protects interpolated ticket detail fields', () => {
    const value = '<img src=x onerror=alert(1)>\nLínea & "comilla"';
    assert.equal(
        safeText.escapeHTML(value),
        '&lt;img src=x onerror=alert(1)&gt;\nLínea &amp; &quot;comilla&quot;'
    );
});

test('shared comment renderer preserves literal markup and line breaks', () => {
    const document = { createElement: () => new Element(document) };
    const container = new Element(document);
    const commentText = '<script>alert(1)</script>\nComentario & prueba';
    safeText.renderComments(container, [{
        username: '<b>Nombre</b>',
        comentario: commentText,
        fecha: '2026-10-01T12:00:00.000Z'
    }]);

    const comment = container.children[0].children[1];
    assert.equal(comment.textContent, commentText);
    assert.equal(comment.innerHTML, '');
    assert.match(comment.style.cssText, /white-space:pre-wrap/);
    assert.equal(container.children[0].children[0].children[0].textContent, '<b>Nombre</b>');
});

test('shared history and notification renderers keep user markup as text', () => {
    const document = { createElement: () => new Element(document) };
    const history = new Element(document);
    const notification = new Element(document);
    const unsafe = '<svg onload=alert(1)>\nLínea & detalle';

    safeText.renderHistory(history, [{
        accion: '<b>Acción</b>',
        username: '<i>Persona</i>',
        descripcion: unsafe,
        created_at: '2026-10-01T12:00:00.000Z'
    }]);
    const description = history.children[0].children[2];
    assert.equal(description.textContent, unsafe);
    assert.equal(description.innerHTML, '');
    assert.match(description.style.cssText, /white-space:pre-wrap/);

    safeText.appendNotification(notification, unsafe, 'Ahora');
    assert.equal(notification.children[0].textContent, unsafe);
    assert.equal(notification.children[0].innerHTML, '');
    assert.equal(notification.children[1].textContent, 'Ahora');
});

test('ticket form serialization includes the named server fields and conditionally omits academic values', () => {
    const data = new FormData();
    const values = {
        titulo: 'Problema de red',
        descripcion: 'Sin conexión\nDesde la mañana',
        categoria_usuario: 'Internet',
        impacto: 'Medio',
        urgencia: 'Media',
        bloque: 'Bloque B',
        ambiente: 'Administración',
        aula: '',
        solicitante_nombre: 'Persona de prueba',
        codigo_universitario_dni: '12345678',
        tipo_solicitante: 'oficina',
        carrera: '',
        asignatura_area: '',
        tecnico_id: ''
    };
    Object.entries(values).forEach(([key, value]) => data.append(key, value));
    const { payload, officeCode, categoryCode } = ticketForm.collect(data);

    assert.equal(payload.titulo, values.titulo);
    assert.equal(payload.descripcion, values.descripcion);
    assert.equal(payload.tipo_solicitante, 'oficina');
    assert.equal(payload.carrera, null);
    assert.equal(officeCode, 'ADM');
    assert.equal(categoryCode, 'ADM-EQUIPOS');
});

test('ticket form HTML names match the serialized backend fields', () => {
    const html = fs.readFileSync(path.join(__dirname, '../frontend/index.html'), 'utf8');
    for (const [id, name] of [
        ['titulo', 'titulo'],
        ['descripcion', 'descripcion'],
        ['ticketCategoria', 'categoria_usuario'],
        ['impacto', 'impacto'],
        ['urgencia', 'urgencia'],
        ['ticketBloque', 'bloque'],
        ['ticketAmbiente', 'ambiente'],
        ['ticketNumeroAula', 'aula'],
        ['solicitanteNombre', 'solicitante_nombre'],
        ['codigoUniversitarioDni', 'codigo_universitario_dni'],
        ['tipoSolicitante', 'tipo_solicitante'],
        ['carreraTicket', 'carrera'],
        ['asignaturaArea', 'asignatura_area'],
        ['asignarTecnico', 'tecnico_id']
    ]) {
        assert.match(html, new RegExp(`<[^>]*id="${id}"[^>]*name="${name}"`), id);
    }
});
