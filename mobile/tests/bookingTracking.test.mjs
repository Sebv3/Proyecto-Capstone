import assert from 'node:assert/strict';
import test from 'node:test';
import axios from 'axios';

process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000/api/v1';
let handler;
axios.defaults.adapter = (config) => handler(config);
const api = await import('../src/api/bookings.ts');
const { bookingSteps, workerActions, canCancelBooking, canConfirmBooking, isTerminalBooking } = await import('../src/services/bookingTracking.ts');
const { bookingDayRange } = await import('../src/services/bookingForm.ts');
const response = (config, data) => ({ config, data, status: 200, statusText: 'OK', headers: {} });
const booking = { id: 'booking-1', estado: 'PENDIENTE', modalidad: 'DOMICILIO' };

test('tracking follows each modality and includes payment before execution', () => {
  assert.deepEqual(bookingSteps('DOMICILIO'), ['PENDIENTE', 'ACEPTADA', 'PAGADA', 'EN_CAMINO', 'EN_CURSO', 'COMPLETADA']);
  assert.deepEqual(bookingSteps('TALLER'), ['PENDIENTE', 'ACEPTADA', 'PAGADA', 'EN_CURSO', 'LISTO', 'COMPLETADA']);
});
test('every state only exposes applicable worker actions and none to the client', () => {
  const expected = {
    DOMICILIO: { PENDIENTE: ['aceptar', 'rechazar'], PAGADA: ['en-camino'], EN_CAMINO: ['iniciar'] },
    TALLER: { PENDIENTE: ['aceptar', 'rechazar'], PAGADA: ['iniciar'], EN_CURSO: ['listo'] },
  };
  for (const modalidad of ['DOMICILIO', 'TALLER']) for (const estado of [...bookingSteps(modalidad), 'CANCELADA', 'RECHAZADA']) {
    const item = { ...booking, modalidad, estado };
    assert.deepEqual(workerActions(item, 'TRABAJADOR').map((a) => a.action), expected[modalidad][estado] ?? []);
    assert.deepEqual(workerActions(item, 'CLIENTE'), []);
    assert.equal(canCancelBooking(item), ['PENDIENTE', 'ACEPTADA'].includes(estado));
    assert.equal(canConfirmBooking(item), estado === (modalidad === 'DOMICILIO' ? 'EN_CURSO' : 'LISTO'));
    assert.equal(isTerminalBooking(item), ['COMPLETADA', 'CANCELADA', 'RECHAZADA'].includes(estado));
  }
});
test('agenda uses a half-open local day range and rejects invalid dates', () => {
  assert.deepEqual(bookingDayRange('10-01-2030'), {
    desde: new Date(2030, 0, 10).toISOString(), hasta: new Date(2030, 0, 11).toISOString(),
  });
  assert.equal(bookingDayRange('30-02-2030'), null);
  assert.equal(bookingDayRange('2030-01-10'), null);
});
test('listing and detail authenticate and support filtering, pagination and abort', async () => {
  const controller = new AbortController();
  handler = async (config) => {
    assert.equal(config.headers.Authorization, 'Bearer participant-token');
    assert.equal(config.signal, controller.signal);
    if (config.url === '/solicitudes') {
      assert.deepEqual(config.params, { estado: 'ACEPTADA', agenda: true, desde: '2030-01-10T03:00:00Z', hasta: undefined, limit: 20, offset: 20 });
      return response(config, [booking]);
    }
    assert.equal(config.url, '/solicitudes/booking-1');
    return response(config, booking);
  };
  assert.deepEqual(await api.getBookings('participant-token', { estado: 'ACEPTADA', agenda: true, desde: '2030-01-10T03:00:00Z', offset: 20 }, controller.signal), [booking]);
  assert.deepEqual(await api.getBooking('participant-token', booking.id, controller.signal), booking);
});
test('accepting returns server state and forbids a manual payment action', async () => {
  handler = async (config) => {
    assert.equal(config.url, '/solicitudes/booking-1/aceptar');
    assert.equal(config.method, 'post');
    assert.equal(config.headers.Authorization, 'Bearer worker-token');
    assert.equal(config.data, undefined);
    return response(config, { ...booking, estado: 'ACEPTADA' });
  };
  assert.equal((await api.changeBooking('worker-token', booking.id, 'aceptar')).estado, 'ACEPTADA');
  await assert.rejects(api.changeBooking('worker-token', booking.id, 'pagar'), /Acción no permitida/);
});
test('cancellation and completion send only their expected data and preserve leading zeros', async () => {
  handler = async (config) => {
    const cancel = config.url.endsWith('/cancelar');
    assert.deepEqual(JSON.parse(config.data), cancel ? { motivo: 'No puedo asistir' } : { codigo: '012345' });
    assert.equal(config.headers.Authorization, 'Bearer client-token');
    return response(config, { ...booking, estado: cancel ? 'CANCELADA' : 'COMPLETADA' });
  };
  assert.equal((await api.cancelBooking('client-token', booking.id, '  No puedo asistir  ')).estado, 'CANCELADA');
  assert.equal((await api.completeBooking('client-token', booking.id, ' 012345 ')).estado, 'COMPLETADA');
});
test('confirmation code is obtained through the worker endpoint and not stored as a booking field', async () => {
  handler = async (config) => {
    assert.equal(config.url, '/solicitudes/booking-1/codigo-confirmacion');
    assert.equal(config.headers.Authorization, 'Bearer worker-token');
    return response(config, { codigo: '012345', expira_en: '2030-01-11T10:00:00Z' });
  };
  assert.equal((await api.getConfirmationCode('worker-token', booking.id)).codigo, '012345');
});
test('conflicts and uncertain network results instruct the user to refresh', () => {
  const conflict = new axios.AxiosError('failed', 'ERR_BAD_REQUEST', {}, {}, { status: 409, data: { detail: 'internal data' } });
  assert.match(api.bookingOperationError(conflict), /Actualiza/);
  assert.doesNotMatch(api.bookingOperationError(conflict), /internal data/);
  assert.match(api.bookingOperationError(new axios.AxiosError('offline')), /antes de repetir/);
});
