import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import axios from 'axios';
import { buildMapHtml, parseMapEvent } from '../src/services/coverageMap.ts';
import { coverageLabel, distanceKm } from '../src/services/serviceDistance.ts';

process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000/api/v1';
let handler;
axios.defaults.adapter = (config) => handler(config);
const { getLocations, getLocation, locationErrorMessage } = await import('../src/api/locations.ts');
const { getMapServices } = await import('../src/api/serviceMap.ts');
const point = { id: 'local-1', nombre: 'Taller Central', latitud: -33.45, longitud: -70.66 };

test('distance handles identical, known and antipodal coordinates', () => {
  const origin = { latitud: 0, longitud: 0 };
  assert.equal(distanceKm(origin, origin), 0);
  assert.ok(Math.abs(distanceKm(origin, { latitud: 0, longitud: 1 }) - 111.195) < 0.01);
  assert.ok(Math.abs(distanceKm(origin, { latitud: 0, longitud: 180 }) - 20015.087) < 0.01);
});

test('coverage distinguishes workshop proximity and a home service outside its radius', () => {
  const home = { latitud: 0, longitud: 0, modalidad: 'DOMICILIO', radio_cobertura_km: 5 };
  assert.match(coverageLabel(home, home), /Dentro de la cobertura/);
  assert.match(coverageLabel(home, { latitud: 0, longitud: 1 }), /Fuera de la cobertura/);
  assert.match(coverageLabel({ ...home, modalidad: 'TALLER', radio_cobertura_km: null }, home), /Taller a 0,0 km en línea recta/);
});

test('only the picker accepts finite coordinates from the map bridge', () => {
  const event = JSON.stringify({ type: 'pick', latitud: -33.45, longitud: -70.66 });
  assert.equal(parseMapEvent(event, []), null);
  assert.deepEqual(parseMapEvent(event, [], true), { type: 'pick', latitud: -33.45, longitud: -70.66 });
  for (const [latitud, longitud] of [[91, 0], [0, 181], ['-33', 0], [null, 0]]) {
    assert.equal(parseMapEvent(JSON.stringify({ type: 'pick', latitud, longitud }), [], true), null);
  }
});

test('service map fetches public offers without sending the client location or token', async () => {
  handler = async (config) => {
    assert.equal(config.url, '/mapa/servicios');
    assert.equal(config.headers.Authorization, undefined);
    assert.equal(config.params, undefined);
    return { config, data: [], status: 200, statusText: 'OK', headers: {} };
  };
  assert.deepEqual(await getMapServices(), []);
});

test('map bridge accepts only existing local IDs and bounded JSON messages', () => {
  assert.deepEqual(parseMapEvent('{"type":"select","id":"local-1"}', [point]), { type: 'select', id: 'local-1' });
  for (const value of ['bad json', 'null', '{"type":"select","id":"other"}', '{"type":"open","url":"https://evil.test"}', 'x'.repeat(1001)]) {
    assert.equal(parseMapEvent(value, [point]), null);
  }
});

test('local names cannot terminate scripts or become executable HTML', () => {
  const malicious = '</script><script>alert("xss")</script>\u2028&';
  const html = buildMapHtml([{ ...point, nombre: malicious }]);
  assert.equal(html.includes(malicious), false);
  assert.match(html, /label\.textContent=p\.nombre/);
  assert.match(html, /form-action 'none'/);
  assert.match(html, /integrity="sha256-/);
});

test('map fits valid coordinates, reports readiness and sends marker selection', () => {
  const html = buildMapHtml([point, { ...point, id: 'invalid', latitud: 95 }]);
  const script = html.match(/<script nonce="servimatch-map">([\s\S]*?)<\/script>/)[1];
  const events = []; const tileHandlers = {}; const markerHandlers = {};
  let fitted;
  const map = { attributionControl: { setPrefix() {} }, fitBounds(bounds) { fitted = bounds; }, invalidateSize() {} };
  const tiles = { on(name, handler) { tileHandlers[name] = handler; }, addTo() {} };
  const marker = { addTo() { return this; }, bindTooltip(label) { assert.equal(label.textContent, point.nombre); return this; }, on(name, handler) { markerHandlers[name] = handler; } };
  const context = { L: { map: () => map, tileLayer: () => tiles, circleMarker: () => marker },
    document: { addEventListener() {}, createElement: () => ({}) }, setTimeout() {},
    window: { L: true, ReactNativeWebView: { postMessage: (value) => events.push(JSON.parse(value)) } } };
  vm.runInNewContext(script, context);
  assert.equal(JSON.stringify(fitted), JSON.stringify([[point.latitud, point.longitud]]));
  tileHandlers.tileload(); markerHandlers.click();
  assert.deepEqual(events, [{ type: 'ready' }, { type: 'select', id: point.id }]);
});

test('location API forwards cancellation and never sends auth to the map catalog', async () => {
  const controller = new AbortController();
  handler = async (config) => {
    assert.equal(config.signal, controller.signal);
    assert.equal(config.headers.Authorization, undefined);
    return { config, data: config.url === '/locales' ? [point] : point, status: 200, headers: {}, statusText: 'OK' };
  };
  assert.deepEqual(await getLocations(controller.signal), [point]);
  assert.deepEqual(await getLocation(point.id, controller.signal), point);
});

test('location errors distinguish unavailable and missing migration without leaking payloads', () => {
  const error = (status) => new axios.AxiosError('private', 'ERR_BAD_RESPONSE', undefined, {}, { status, data: { secret: 'private' } });
  assert.match(locationErrorMessage(error(404)), /ya no está disponible/);
  assert.match(locationErrorMessage(error(503)), /aún no está habilitado/);
  assert.equal(locationErrorMessage(error(500)).includes('private'), false);
});
