const test = require('node:test');
const assert = require('node:assert/strict');

function validarTecnicoParaOficina(tecnico, oficinaId, asignacionesOficina) {
    if (!tecnico || !tecnico.id) return { valido: false, razon: 'Técnico no encontrado' };
    const pertenece = asignacionesOficina.some(a => Number(a.tecnico_id) === Number(tecnico.id) && Number(a.oficina_id) === Number(oficinaId));
    if (pertenece) return { valido: true, razon: 'Técnico asignado a la oficina' };
    return { valido: false, razon: 'El técnico seleccionado no pertenece a la oficina del ticket' };
}

function obtenerOpcionesTecnico(oficinaId, asignacionesOficina, catalogoTecnicos) {
    const tecnicosOficina = asignacionesOficina
        .filter(a => Number(a.oficina_id) === Number(oficinaId))
        .map(a => {
            const tec = catalogoTecnicos.find(t => Number(t.id) === Number(a.tecnico_id));
            return tec ? { ...tec, es_responsable: a.es_responsable } : null;
        })
        .filter(Boolean);

    if (!tecnicosOficina.length) {
        return {
            habilitado: false,
            mensaje: 'No hay técnicos asignados a esta oficina',
            opciones: []
        };
    }
    return {
        habilitado: true,
        mensaje: null,
        opciones: tecnicosOficina
    };
}

test('validarTecnicoParaOficina aprueba técnicos con asignación explícita a la oficina', () => {
    const asignaciones = [
        { tecnico_id: 2, oficina_id: 14 }
    ];
    const tecnico = { id: 2, nombre: 'Tecnico Aulas', es_jefe: false };
    const resultado = validarTecnicoParaOficina(tecnico, 14, asignaciones);
    assert.equal(resultado.valido, true);
    assert.equal(resultado.razon, 'Técnico asignado a la oficina');
});

test('validarTecnicoParaOficina rechaza técnicos sin asignación a la oficina, incluso si es_jefe es verdadero', () => {
    const asignaciones = [
        { tecnico_id: 1, oficina_id: 1 } // Solo asignado a OTI (1)
    ];
    const tecnicoJefe = { id: 1, nombre: 'Tecnico Jefe', es_jefe: true };
    // Intentando asignar a oficina 14 (Aulas) sin relación explícita
    const resultado = validarTecnicoParaOficina(tecnicoJefe, 14, asignaciones);
    assert.equal(resultado.valido, false);
    assert.equal(resultado.razon, 'El técnico seleccionado no pertenece a la oficina del ticket');
});

test('obtenerOpcionesTecnico retorna mensaje claro y deshabilita selector si la oficina no tiene técnicos', () => {
    const asignaciones = [
        { tecnico_id: 1, oficina_id: 1 }
    ];
    const catalogo = [{ id: 1, nombre: 'Tecnico Jefe', es_jefe: true }];
    const resultado = obtenerOpcionesTecnico(99, asignaciones, catalogo);
    assert.equal(resultado.habilitado, false);
    assert.equal(resultado.mensaje, 'No hay técnicos asignados a esta oficina');
    assert.equal(resultado.opciones.length, 0);
});
