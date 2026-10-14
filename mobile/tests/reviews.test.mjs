import assert from 'node:assert/strict';
import test from 'node:test';
import axios from 'axios';
process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000/api/v1';
let handler;
axios.defaults.adapter = (config) => handler(config);
const api = await import('../src/api/reviews.ts');
const response = (config, data) => ({ config, data, status: 200, statusText: 'OK', headers: {} });

test('client review sends only rating and normalized optional comment', async () => {
  handler = async (config) => {
    assert.equal(config.url, '/solicitudes/booking%2F1/calificacion');
    assert.equal(config.headers.Authorization, 'Bearer client-token');
    assert.deepEqual(JSON.parse(config.data), { puntuacion: 5, comentario: null });
    return response(config, { puntuacion: 5, comentario: null });
  };
  assert.equal((await api.createReview('client-token', 'booking/1', 5, '  ')).puntuacion, 5);
});

test('invalid scores and oversized comments never make an HTTP request', async () => {
  handler = () => assert.fail('Invalid input reached HTTP');
  for (const rating of [0, 6, 4.5, '5', true, NaN]) await assert.rejects(api.createReview('token', 'id', rating, ''));
  await assert.rejects(api.createReview('token', 'id', 5, 'x'.repeat(1001)));
});

test('private booking reviews authenticate while public reputation does not send a session', async () => {
  const controller = new AbortController();
  handler = async (config) => {
    assert.equal(config.signal, controller.signal);
    if (config.url.startsWith('/solicitudes')) {
      assert.equal(config.headers.Authorization, 'Bearer participant');
      return response(config, null);
    }
    assert.equal(config.url, '/trabajadores/worker-1/calificaciones');
    assert.equal(config.headers.Authorization, undefined);
    assert.deepEqual(config.params, { limit: 20, offset: 20 });
    return response(config, { cantidad: 0, promedio: null, items: [] });
  };
  assert.equal(await api.getBookingReview('participant', 'booking-1', controller.signal), null);
  assert.equal((await api.getWorkerReviews('worker-1', 20, controller.signal)).promedio, null);
});

test('duplicates and uncertain requests explain retry without exposing private responses', () => {
  const error = new axios.AxiosError('private', '', {}, {}, { status: 409, data: { secret: 'hidden' } });
  assert.match(api.reviewError(error), /una vez/);
  assert.doesNotMatch(api.reviewError(error), /private|hidden/);
  assert.match(api.reviewError(new axios.AxiosError('timeout')), /Actualiza/);
});
