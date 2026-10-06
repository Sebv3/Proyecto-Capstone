import assert from 'node:assert/strict';
import test from 'node:test';
import axios from 'axios';

process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000/api/v1';
let handler;
axios.defaults.adapter = (config) => handler(config);
const { searchServices, getServiceDetail, getFeaturedServices, catalogErrorMessage } = await import('../src/api/catalog.ts');
const { catalogFiltersSchema, formatCatalogPrice } = await import('../src/services/catalogFilters.ts');
const blank = { q: '', categoria_id: '', modalidad: '', precio_min: '', precio_max: '' };
const categoryId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const response = (config, data) => ({ config, data, status: 200, statusText: 'OK', headers: {} });

test('empty filters load all services and text and prices are normalized', () => {
  assert.deepEqual(catalogFiltersSchema.parse(blank), {
    q: undefined, categoria_id: undefined, modalidad: undefined, precio_min: undefined, precio_max: undefined,
  });
  assert.deepEqual(catalogFiltersSchema.parse({ ...blank, q: ' grifería ', categoria_id: categoryId,
    modalidad: 'DOMICILIO', precio_min: ' 1000 ', precio_max: '25000' }), {
    q: 'grifería', categoria_id: categoryId, modalidad: 'DOMICILIO', precio_min: 1000, precio_max: 25000,
  });
});

test('filters reject short searches, invalid categories and malformed prices', () => {
  for (const change of [
    { q: ' x ' }, { q: 'x'.repeat(101) }, { categoria_id: 'invalid' }, { modalidad: 'OTHER' },
    { precio_min: '0' }, { precio_max: '-1' }, { precio_min: '1.5' }, { precio_max: '25.000' },
    { precio_min: '1e3' }, { precio_max: '9007199254740992' },
  ]) assert.equal(catalogFiltersSchema.safeParse({ ...blank, ...change }).success, false);
});

test('price bounds allow one-sided and equal prices but reject an inverted range', () => {
  for (const change of [{ precio_min: '100' }, { precio_max: '100' }, { precio_min: '100', precio_max: '100' }]) {
    assert.equal(catalogFiltersSchema.safeParse({ ...blank, ...change }).success, true);
  }
  const result = catalogFiltersSchema.safeParse({ ...blank, precio_min: '200', precio_max: '100' });
  assert.equal(result.success, false);
  assert.deepEqual(result.error.issues[0].path, ['precio_max']);
});

test('search sends all filters and pagination without exposing authentication', async () => {
  const filters = { q: 'reparación', categoria_id: categoryId, modalidad: 'TALLER', precio_min: 1000, precio_max: 50000 };
  const page = { items: [{ id: 'service-1' }], total: 21, limit: 20, offset: 20 };
  handler = async (config) => {
    assert.equal(config.url, '/servicios');
    assert.equal(config.method, 'get');
    assert.equal(config.headers.Authorization, undefined);
    assert.deepEqual(config.params, { ...filters, limit: 20, offset: 20 });
    return response(config, page);
  };
  assert.deepEqual(await searchServices(filters, 20, 20), page);
});

test('empty results remain a successful catalog response', async () => {
  const page = { items: [], total: 0, limit: 20, offset: 0 };
  handler = async (config) => response(config, page);
  assert.deepEqual(await searchServices({}), page);
});

test('featured services use the first catalog page', async () => {
  handler = async (config) => {
    assert.deepEqual(config.params, { limit: 5, offset: 0 });
    return response(config, { items: [{ id: 'featured' }], total: 1, limit: 5, offset: 0 });
  };
  assert.deepEqual(await getFeaturedServices(), [{ id: 'featured' }]);
});

test('detail fetches the selected service and returns its complete catalog data', async () => {
  const service = { id: 'service-1', nombre: 'Grifería', descripcion: 'Reparación completa', precio_base: 25000,
    duracion_estimada_minutos: 60, modalidad: 'DOMICILIO', categoria: { id: categoryId },
    trabajador: { nombre: 'Ana', comuna: { nombre: 'Santiago' } } };
  handler = async (config) => {
    assert.equal(config.url, '/servicios/service-1');
    assert.equal(config.headers.Authorization, undefined);
    return response(config, service);
  };
  assert.deepEqual(await getServiceDetail('service-1'), service);
});

test('search and detail pass cancellation signals so abandoned requests can be canceled', async () => {
  const controller = new AbortController();
  let calls = 0;
  handler = async (config) => {
    calls++;
    assert.equal(config.signal, controller.signal);
    return response(config, {});
  };
  await searchServices({}, 20, 0, controller.signal);
  await getServiceDetail('service-1', controller.signal);
  controller.abort();
  await assert.rejects(searchServices({}, 20, 0, controller.signal), axios.isCancel);
  assert.equal(calls, 2);
});

test('catalog errors explain missing services and validation without leaking server details', () => {
  for (const [status, expected] of [[404, /ya no está disponible/], [422, /filtros/], [502, /Inténtalo/]]) {
    const error = new axios.AxiosError('Request failed', undefined, undefined, undefined, {
      status, data: { detail: 'private database details' }, statusText: '', headers: {}, config: {},
    });
    assert.match(catalogErrorMessage(error), expected);
    assert.doesNotMatch(catalogErrorMessage(error), /private|database/);
  }
  assert.match(catalogErrorMessage(new axios.AxiosError('Network Error')), /conectar/);
  assert.match(formatCatalogPrice(25000), /25[.,]000/);
});
