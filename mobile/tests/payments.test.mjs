import assert from 'node:assert/strict';
import test from 'node:test';
import axios from 'axios';

process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000/api/v1';
let handler;
axios.defaults.adapter = (config) => handler(config);
const api = await import('../src/api/payments.ts');
const { paymentUnavailableReason } = await import('../src/services/paymentAvailability.ts');
const response = (config, data) => ({ config, data, status: 200, statusText: 'OK', headers: {} });

test('an accepted booking can only offer payment before its scheduled instant', () => {
  const booking = { estado: 'ACEPTADA', inicio_en: '2026-10-13T16:30:00+00:00' };
  assert.equal(paymentUnavailableReason(booking, Date.parse('2026-10-13T13:29:59-03:00')), null);
  assert.match(paymentUnavailableReason(booking, Date.parse('2026-10-13T13:30:00-03:00')), /ya pasó/);
  assert.match(paymentUnavailableReason(booking, Date.parse('2026-10-13T20:41:00-03:00')), /nuevo horario futuro/);
});

test('changed states and malformed booking dates do not offer payment', () => {
  for (const estado of ['PENDIENTE', 'PAGADA', 'CANCELADA', 'RECHAZADA', 'COMPLETADA']) {
    assert.ok(paymentUnavailableReason({ estado, inicio_en: '2030-01-01T12:00:00Z' }, 0));
  }
  assert.match(paymentUnavailableReason({ estado: 'ACEPTADA', inicio_en: 'invalid' }), /verificar la fecha/);
});

test('payment summary is authenticated and abortable; amounts come from server', async () => {
  const controller = new AbortController();
  handler = async (config) => {
    assert.equal(config.url, '/solicitudes/booking%2F1/pago');
    assert.equal(config.headers.Authorization, 'Bearer client-token');
    assert.equal(config.signal, controller.signal);
    return response(config, { tarifa_base: 20000, comision: 3000, monto_total: 23000, pago: null });
  };
  assert.equal((await api.getPaymentSummary('client-token', 'booking/1', controller.signal)).monto_total, 23000);
});

test('simulation sends no price, participant, payment state or booking state', async () => {
  handler = async (config) => {
    assert.equal(config.url, '/solicitudes/booking-1/pago/simular');
    assert.equal(config.method, 'post');
    assert.equal(config.headers.Authorization, 'Bearer client-token');
    assert.deepEqual(JSON.parse(config.data), {});
    return response(config, { pago: { id: 'receipt-1', simulado: true }, solicitud: { estado: 'PAGADA' } });
  };
  const result = await api.simulatePayment('client-token', 'booking-1');
  assert.equal(result.solicitud.estado, 'PAGADA');
  assert.equal(result.pago.simulado, true);
});

test('uncertain simulation requests instruct refresh and never expose server details', () => {
  assert.match(api.paymentErrorMessage(new axios.AxiosError('private')), /Actualiza/);
  for (const status of [401, 403, 404, 409, 503, 500]) {
    const error = new axios.AxiosError('private', '', {}, {}, { status, data: { detail: 'secret' } });
    assert.ok(!api.paymentErrorMessage(error).includes('secret'));
  }
});
