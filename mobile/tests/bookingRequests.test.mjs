import assert from 'node:assert/strict';
import test from 'node:test';
import axios from 'axios';

process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000/api/v1';
let handler;
axios.defaults.adapter = (config) => handler(config);
const { getBookings } = await import('../src/api/bookings.ts');
const { bookingViewStates, bookingAttention, bookingStatusColor, mergeBookings } = await import('../src/services/bookingRequests.ts');

test('active and history tabs partition every booking status without overlap', () => {
  assert.deepEqual(bookingViewStates.activas, ['PENDIENTE', 'ACEPTADA', 'PAGADA', 'EN_CAMINO', 'EN_CURSO', 'LISTO']);
  assert.deepEqual(bookingViewStates.historial, ['COMPLETADA', 'CANCELADA', 'RECHAZADA']);
  assert.equal(new Set(Object.values(bookingViewStates).flat()).size, 9);
});

test('each tab sends its scope with status, authentication, abort and pagination to the server', async () => {
  const controller = new AbortController();
  for (const vista of ['activas', 'historial']) {
    handler = async (config) => {
      assert.equal(config.url, '/solicitudes');
      assert.equal(config.headers.Authorization, 'Bearer client-token');
      assert.equal(config.signal, controller.signal);
      assert.equal(config.params.vista, vista);
      assert.equal(config.params.estado, vista === 'activas' ? 'ACEPTADA' : 'CANCELADA');
      assert.equal(config.params.offset, 20);
      assert.equal(config.params.limit, 20);
      return { config, data: [], status: 200, statusText: 'OK', headers: {} };
    };
    await getBookings('client-token', { vista, estado: vista === 'activas' ? 'ACEPTADA' : 'CANCELADA', offset: 20 }, controller.signal);
  }
});

test('overdue warnings only apply to pending and accepted requests without changing their state', () => {
  const now = Date.parse('2030-01-10T13:00:00Z');
  for (const estado of Object.values(bookingViewStates).flat()) {
    const booking = { estado, inicio_en: '2030-01-10T12:00:00Z', modalidad: 'TALLER' };
    assert.equal(bookingAttention(booking, now) === 'Fecha de atención vencida', ['PENDIENTE', 'ACEPTADA'].includes(estado));
    assert.equal(booking.estado, estado);
  }
  assert.equal(bookingAttention({ estado: 'PENDIENTE', inicio_en: '2030-01-10T13:00:00Z' }, now), null);
});

test('attention prompts distinguish payment from pickup and confirmation', () => {
  const booking = { inicio_en: '2030-01-10T12:00:00Z', modalidad: 'TALLER' };
  const now = Date.parse('2030-01-09T12:00:00Z');
  assert.equal(bookingAttention({ ...booking, estado: 'ACEPTADA' }, now), 'Pendiente de tu pago');
  assert.equal(bookingAttention({ ...booking, estado: 'LISTO' }, now), 'Listo para retirar y confirmar');
  assert.equal(bookingAttention({ ...booking, estado: 'LISTO', modalidad: 'DOMICILIO' }, now), 'Pendiente de tu confirmación');
});

test('status colors distinguish waiting, finished, rejected and ongoing states', () => {
  assert.equal(bookingStatusColor('ACEPTADA'), bookingStatusColor('PENDIENTE'));
  assert.equal(bookingStatusColor('CANCELADA'), bookingStatusColor('RECHAZADA'));
  assert.notEqual(bookingStatusColor('PENDIENTE'), bookingStatusColor('PAGADA'));
  assert.notEqual(bookingStatusColor('COMPLETADA'), bookingStatusColor('PAGADA'));
});

test('overlapping pages do not repeat cards or change the server order', () => {
  const newest = { id: 'newest' }, older = { id: 'older' };
  const original = [newest];
  assert.deepEqual(mergeBookings(original, [newest, older, older]), [newest, older]);
  assert.deepEqual(original, [newest]);
  assert.deepEqual(mergeBookings([], []), []);
});
