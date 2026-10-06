const test = require('node:test');
const assert = require('node:assert/strict');
const { UTEA_PREGRADO_CARRERAS, UTEA_BRAND } = require('../backend/utils/uteaConfig');

test('incluye las carreras pregrado oficiales de UTEA Andahuaylas', () => {
  assert.ok(UTEA_PREGRADO_CARRERAS.includes('Agronomía'));
  assert.ok(UTEA_PREGRADO_CARRERAS.includes('Ingeniería Civil'));
  assert.ok(UTEA_PREGRADO_CARRERAS.includes('Ingeniería Ambiental y Recursos Naturales'));
  assert.ok(UTEA_PREGRADO_CARRERAS.includes('Contabilidad'));
  assert.ok(UTEA_PREGRADO_CARRERAS.includes('Derecho'));
  assert.ok(UTEA_PREGRADO_CARRERAS.includes('Educación'));
  assert.ok(UTEA_PREGRADO_CARRERAS.includes('Enfermería'));
});

test('define la identidad institucional de UTEA', () => {
  assert.match(UTEA_BRAND.name, /UTEA/i);
  assert.ok(UTEA_BRAND.logoUrl.length > 0);
  assert.ok(UTEA_BRAND.primaryColor.length > 0);
});
