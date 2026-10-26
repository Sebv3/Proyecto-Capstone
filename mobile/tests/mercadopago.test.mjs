import assert from 'node:assert/strict';
import test from 'node:test';
import axios from 'axios';
process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000/api/v1';
let handler;
axios.defaults.adapter = (config) => handler(config);
const api = await import('../src/api/mercadopago.ts');
const response = (config, data) => ({ config, data, status: 200, statusText: 'OK', headers: {} });

test('configuration is public and contains only the payment mode', async () => {
  handler = async (config) => {
    assert.equal(config.url, '/pagos/configuracion');
    assert.equal(config.headers.Authorization, undefined);
    return response(config, { modo: 'MERCADO_PAGO_TEST' });
  };
  assert.equal(await api.getPaymentMode(), 'MERCADO_PAGO_TEST');
});

test('disabled Mercado Pago never enables an internal simulated payment', async () => {
  handler = async (config) => response(config, { modo: 'DESHABILITADO' });
  assert.equal(await api.getPaymentMode(), 'DESHABILITADO');
  handler = async (config) => response(config, { modo: 'SIMULADO' });
  await assert.rejects(api.getPaymentMode(), /inválida/);
});
test('creating checkout sends only session and booking ID, never amount or credentials', async () => {
  handler = async (config) => {
    assert.equal(config.method, 'post');
    assert.equal(config.url, '/solicitudes/booking%2F1/pago/mercadopago');
    assert.equal(config.headers.Authorization, 'Bearer client-token');
    assert.deepEqual(JSON.parse(config.data), {});
    return response(config, { estado: 'LISTO' });
  };
  assert.equal((await api.createMercadoPagoCheckout('client-token', 'booking/1')).estado, 'LISTO');
});
test('read and reconcile are distinct requests and support cancellation', async () => {
  const controller = new AbortController();
  handler = async (config) => {
    assert.equal(config.signal, controller.signal);
    assert.equal(config.headers.Authorization, 'Bearer token');
    if (config.method === 'post') {
      assert.ok(config.url.endsWith('/sincronizar'));
      assert.deepEqual(JSON.parse(config.data), {});
    }
    return response(config, null);
  };
  assert.equal(await api.getMercadoPagoCheckout('token', 'id', controller.signal), null);
  assert.equal(await api.syncMercadoPagoCheckout('token', 'id', controller.signal), null);
});
test('checkout links require official HTTPS host and reject credentials or deceptive domains', () => {
  assert.equal(api.safeCheckoutUrl('https://www.mercadopago.cl/checkout/v1/redirect?pref_id=test'), 'https://www.mercadopago.cl/checkout/v1/redirect?pref_id=test');
  for (const url of ['http://www.mercadopago.cl/', 'https://www.mercadopago.cl.evil.test/', 'https://evil.test/', 'https://secret@www.mercadopago.cl/', 'javascript:alert(1)']) assert.throws(() => api.safeCheckoutUrl(url));
});
test('failures explain unknown results without exposing provider secrets', () => {
  const error = (status) => new axios.AxiosError('private', '', {}, {}, { status });
  assert.match(api.mercadoPagoError(error(503)), /migración/);
  assert.match(api.mercadoPagoError(error(409)), /Actualiza/);
  assert.doesNotMatch(api.mercadoPagoError(error(500)), /private/);
});
