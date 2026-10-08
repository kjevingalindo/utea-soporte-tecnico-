const test = require('node:test');
const assert = require('node:assert/strict');
const { columns, valuesFor, paginate, createHeader, render } = require('../frontend/js/ticketTable');

test('ticket table defines nine independent columns and matching cell data', () => {
    const ticket = {
        id: 31,
        titulo: 'Proyector no enciende',
        solicitante_nombre: 'Solicitante de prueba',
        username: 'admin-que-registro',
        tipo_solicitante: 'estudiante',
        categoria_usuario: 'Aulas',
        oficina_nombre: 'Laboratorio',
        bloque: 'B',
        ambiente: 'Lab 2',
        aula: '4',
        prioridad: 'Alta',
        estado: 'Asignado',
        fecha_creacion: '2026-10-07 10:30:00',
        tecnico: 'Técnico de prueba'
    };
    const values = valuesFor(ticket);

    assert.deepEqual(columns.map(column => column.label), [
        'Incidencia', 'Solicitante', 'Categoría', 'Ubicación', 'Prioridad',
        'Estado', 'Registro', 'Técnico asignado', 'Acciones'
    ]);
    assert.equal(columns.length, 9);
    assert.equal(Object.keys(values).length, columns.length - 1);
    assert.equal(values.incident.reference, '#31');
    assert.equal(values.requester.name, 'Solicitante de prueba');
    assert.equal(values.requester.type, 'Estudiante');
    assert.equal(values.category, 'Aulas');
    assert.equal(values.location, 'Laboratorio · B · Lab 2 · Aula 4');
    assert.equal(values.priority, 'Alta');
    assert.equal(values.state, 'Asignado');
    assert.match(values.created, /2026/);
    assert.equal(values.technician, 'Técnico de prueba');
});

test('rendered table header and each result row have the same nine-column order', () => {
    class TestElement {
        constructor() {
            this.children = [];
            this.className = '';
            this.classList = { add() {} };
            this.listeners = {};
        }
        append(...children) { this.children.push(...children); }
        appendChild(child) { this.children.push(child); }
        replaceChildren(...children) { this.children = children; }
        addEventListener(name, handler) { this.listeners[name] = handler; }
        setAttribute() {}
        closest() { return null; }
    }

    const originalDocument = global.document;
    global.document = { createElement: () => new TestElement() };
    try {
        const header = new TestElement();
        const body = new TestElement();
        let openedTicketId = null;
        createHeader(header);
        render(body, [{ id: 1, titulo: 'Prueba', solicitante_nombre: 'Persona' }], {
            canManage: false,
            getPriorityClass: () => '',
            getStateClass: () => '',
            getSlaStatus: () => '',
            onOpenTicket(ticket) { openedTicketId = ticket.id; },
            onOpenAccount() {},
            onResolve() {},
            onDelete() {},
            onEdit() {},
            onComments() {}
        });

        assert.equal(header.children.length, columns.length);
        assert.equal(body.children.length, 1);
        assert.equal(body.children[0].children.length, columns.length);
        assert.deepEqual(
            header.children.map(cell => cell.className.replace('ticket-header-cell ', '')),
            columns.map(column => `ticket-column-${column.key}`)
        );
        assert.deepEqual(
            body.children[0].children.map(cell => cell.className.replace('ticket-cell ', '')),
            columns.map(column => `ticket-column-${column.key}`)
        );
        body.children[0].children[8].children[0].listeners.click();
        assert.equal(openedTicketId, 1);
    } finally {
        if (originalDocument === undefined) delete global.document;
        else global.document = originalDocument;
    }
});

test('ticket table labels unavailable requester and assignment data without substituting registrant', () => {
    const values = valuesFor({
        id: 32,
        titulo: 'Incidencia sin asignación',
        username: 'cuenta-administradora',
        categoria_nombre: 'Redes'
    });

    assert.equal(values.requester.name, 'No registrado');
    assert.equal(values.requester.type, 'No registrado');
    assert.equal(values.category, 'Redes');
    assert.equal(values.location, 'No registrada');
    assert.equal(values.priority, 'No registrada');
    assert.equal(values.state, 'Sin estado');
    assert.equal(values.created, 'No registrado');
    assert.equal(values.technician, 'Sin asignar');

    for (const [type, label] of [
        ['estudiante', 'Estudiante'],
        ['administrativo', 'Administrativo'],
        ['oficina', 'Oficina']
    ]) {
        assert.equal(valuesFor({
            id: 33,
            solicitante_nombre: 'Cliente afectado',
            username: 'admin-registrador',
            tipo_solicitante: type
        }).requester.type, label);
    }
});

test('ticket table pagination handles empty, single-page, and multi-page results', () => {
    assert.deepEqual(paginate([], 1, 10), {
        items: [],
        page: 1,
        total: 0,
        totalPages: 1,
        start: 0,
        end: 0
    });

    const onePage = paginate([{ id: 1 }], 1, 10);
    assert.equal(onePage.total, 1);
    assert.equal(onePage.items.length, 1);
    assert.equal(onePage.start, 1);
    assert.equal(onePage.end, 1);

    const tickets = Array.from({ length: 23 }, (_, index) => ({ id: index + 1 }));
    const lastPage = paginate(tickets, 9, 10);
    assert.equal(lastPage.page, 3);
    assert.equal(lastPage.totalPages, 3);
    assert.deepEqual(lastPage.items.map(ticket => ticket.id), [21, 22, 23]);
    assert.equal(lastPage.start, 21);
    assert.equal(lastPage.end, 23);
});
