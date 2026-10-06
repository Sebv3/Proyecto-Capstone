import assert from 'node:assert/strict';
import test from 'node:test';
import axios from 'axios';

process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000/api/v1';
let handler;
axios.defaults.adapter = (config) => handler(config);
const { serviceSchema } = await import('../src/services/serviceSchema.ts');
const { createWorkerService, getOwnServices, workerServicesErrorMessage } = await import('../src/api/workerServices.ts');
const { getCategories } = await import('../src/api/catalog.ts');
const { requestWithSession } = await import('../src/auth/requestWithSession.ts');
const values = {
  categoria_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  nombre: ' Reparación de grifería ', descripcion: ' Reparación y cambio de llaves en el domicilio. ',
  precio_base: '25000', duracion_estimada_minutos: '60', modalidad: 'DOMICILIO',
  ubicacion_publica: 'Sector Plaza Central', latitud: -33.45, longitud: -70.66, radio_cobertura_km: '5',
};
const response = (config, data) => ({ config, data, status: 200, statusText: 'OK', headers: {} });
const apiError = (status, detail = 'private database details', config = {}) => new axios.AxiosError(
  'Request failed', undefined, config, undefined, { ...response(config, { detail }), status },
);

test('service form normalizes text and sends whole CLP and minutes for both modalities', () => {
  for (const modalidad of ['DOMICILIO', 'TALLER']) {
    const parsed = serviceSchema.parse({ ...values, modalidad });
    assert.equal(parsed.nombre, 'Reparación de grifería');
    assert.equal(parsed.descripcion, 'Reparación y cambio de llaves en el domicilio.');
    assert.equal(parsed.precio_base, 25000);
    assert.equal(parsed.duracion_estimada_minutos, 60);
    assert.equal(parsed.modalidad, modalidad);
    assert.equal(parsed.radio_cobertura_km, modalidad === 'DOMICILIO' ? 5 : null);
  }
});

test('publication requires a public location, a valid point and a home coverage radius', () => {
  for (const change of [{ ubicacion_publica: '' }, { latitud: undefined }, { longitud: undefined },
    { latitud: 91 }, { longitud: -181 }, { latitud: Infinity }, { radio_cobertura_km: '0' },
    { radio_cobertura_km: '101' }, { radio_cobertura_km: '1.5' }, { radio_cobertura_km: '' }]) {
    assert.equal(serviceSchema.safeParse({ ...values, ...change }).success, false);
  }
  assert.equal(serviceSchema.parse({ ...values, modalidad: 'TALLER', radio_cobertura_km: '' }).radio_cobertura_km, null);
});

test('service form rejects missing fields and enforces API text lengths', () => {
  for (const change of [
    { categoria_id: '' }, { categoria_id: 'invalid' }, { nombre: '  ab  ' },
    { nombre: 'a'.repeat(121) }, { descripcion: 'short' }, { descripcion: 'a'.repeat(1001) },
    { modalidad: undefined }, { modalidad: 'OTHER' },
  ]) assert.equal(serviceSchema.safeParse({ ...values, ...change }).success, false);
  assert.equal(serviceSchema.safeParse({ ...values, nombre: 'a'.repeat(120), descripcion: 'a'.repeat(1000) }).success, true);
});

test('service form rejects zero, decimals, separators, negatives and unsafe numbers', () => {
  for (const field of ['precio_base', 'duracion_estimada_minutos']) {
    for (const value of ['', ' ', '0', '-1', '1.5', '25.000', '25,000', '1e3', 'Infinity', '9007199254740992']) {
      assert.equal(serviceSchema.safeParse({ ...values, [field]: value }).success, false, `${field}: ${value}`);
    }
    assert.equal(serviceSchema.safeParse({ ...values, [field]: ' 1 ' }).success, true);
  }
  assert.equal(serviceSchema.safeParse({ ...values, duracion_estimada_minutos: '2147483648' }).success, false);
});

test('category catalog includes certification requirements without authentication', async () => {
  const categories = [{ id: values.categoria_id, nombre: 'Electricidad', requiere_certificacion: true, certificacion_requerida: 'Licencia SEC' }];
  handler = async (config) => {
    assert.equal(config.url, '/categorias');
    assert.equal(config.headers.Authorization, undefined);
    return response(config, categories);
  };
  assert.deepEqual(await getCategories(), categories);
});

test('publication sends only editable API fields using the authenticated worker token', async () => {
  const parsed = serviceSchema.parse(values);
  const service = { ...parsed, id: 'service-1', activo: true };
  handler = async (config) => {
    assert.equal(config.method, 'post');
    assert.equal(config.url, '/trabajador/servicios');
    assert.equal(config.headers.Authorization, 'Bearer worker-token');
    assert.deepEqual(JSON.parse(config.data), parsed);
    return response(config, service);
  };
  assert.deepEqual(await createWorkerService('worker-token', { ...parsed, trabajador_id: 'other-user', activo: false }), service);
});

test('home reload retrieves both active and inactive services with the current token', async () => {
  const services = [{ id: 'new-service', activo: true }, { id: 'old-service', activo: false }];
  handler = async (config) => {
    assert.equal(config.method, 'get');
    assert.equal(config.url, '/trabajador/servicios');
    assert.equal(config.headers.Authorization, 'Bearer worker-token');
    return response(config, services);
  };
  assert.deepEqual(await getOwnServices('worker-token'), services);
});

test('publication renews an expired token once and does not retry business restrictions', async () => {
  const session = { access_token: 'expired', refresh_token: 'refresh', expires_at: Date.now() + 3_600_000 };
  const tokens = [];
  let renewals = 0;
  const renew = async () => { renewals++; return { ...session, access_token: 'renewed' }; };
  handler = async (config) => {
    tokens.push(config.headers.Authorization);
    if (config.headers.Authorization === 'Bearer expired') throw apiError(401, '', config);
    return response(config, { id: 'created' });
  };
  await requestWithSession(session, renew, (token) => createWorkerService(token, serviceSchema.parse(values)));
  assert.deepEqual(tokens, ['Bearer expired', 'Bearer renewed']);
  assert.equal(renewals, 1);
  for (const status of [403, 409]) {
    let attempts = 0;
    handler = async (config) => { attempts++; throw apiError(status, '', config); };
    await assert.rejects(requestWithSession(session, renew, (token) => createWorkerService(token, serviceSchema.parse(values))));
    assert.equal(attempts, 1);
  }
  assert.equal(renewals, 1);
});

test('publication failures explain restrictions and hide upstream response details', () => {
  for (const [status, expected] of [
    [401, /sesión venció/], [403, /identidad aprobada/], [409, /cinco servicios activos/],
    [422, /categoría/], [429, /Demasiados intentos/], [502, /más tarde/], [400, /Inténtalo/],
  ]) {
    const message = workerServicesErrorMessage(apiError(status));
    assert.match(message, expected);
    assert.doesNotMatch(message, /private|database/);
  }
  assert.match(workerServicesErrorMessage(new axios.AxiosError('Network Error')), /conexión/);
});
