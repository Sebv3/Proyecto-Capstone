import assert from 'node:assert/strict';
import test from 'node:test';
import axios from 'axios';

process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000/api/v1';
let handler;
axios.defaults.adapter = (config) => handler(config);
const { createBooking, getAvailability, bookingErrorMessage, createAvailability, deleteAvailability, availabilityErrorMessage } = await import('../src/api/bookings.ts');
const { parseBookingTime, localBookingFields, firstBookingStart, buildBookingInput, buildAvailabilityInput, getBookingTimes, formatBookingDate } = await import('../src/services/bookingForm.ts');
const offer = { id: 'service-1', modalidad: 'DOMICILIO', duracion_estimada_minutos: 60, ubicacion_publica: 'Avenida Central 123' };
const start = new Date(2030, 0, 10, 9, 30);
const now = new Date(2030, 0, 9).getTime();
const block = { id: 'block-1', servicio_id: offer.id, inicio_en: start.toISOString(),
  fin_en: new Date(start.getTime() + 120 * 60000).toISOString() };
const fields = { ...localBookingFields(start), address: '  Calle Cliente 456, Santiago  ' };
const response = (config, data) => ({ config, data, status: 200, statusText: 'OK', headers: {} });

test('local booking date round-trips and rejects overflow dates and malformed times', () => {
  assert.equal(parseBookingTime(fields.date, fields.time).toISOString(), start.toISOString());
  for (const [date, time] of [['30-02-2030', '09:30'], ['01-13-2030', '09:30'], ['10-01-2030', '24:00'],
    ['10-01-2030', '09:60'], ['2030-01-10', '09:30'], ['10-01-2030', '9:30']]) {
    assert.equal(parseBookingTime(date, time), null);
  }
});
test('home bookings normalize the private address and only send client-owned input', () => {
  assert.deepEqual(buildBookingInput(offer, fields, [block], now), {
    servicio_id: offer.id, inicio_en: start.toISOString(), direccion_servicio: 'Calle Cliente 456, Santiago',
  });
});
test('workshop bookings never send a client address or override modality or price', () => {
  assert.deepEqual(buildBookingInput({ ...offer, modalidad: 'TALLER' }, fields, [block], now), {
    servicio_id: offer.id, inicio_en: start.toISOString(),
  });
  assert.throws(() => buildBookingInput({ ...offer, modalidad: 'TALLER', ubicacion_publica: null }, fields, [block], now));
});
test('the entire duration must fit one block for this service and be in the future', () => {
  assert.throws(() => buildBookingInput(offer, fields, [block], start.getTime()));
  assert.throws(() => buildBookingInput(offer, { ...fields, time: '11:00' }, [block], now));
  assert.throws(() => buildBookingInput(offer, fields, [{ ...block, servicio_id: 'other' }], now));
  assert.throws(() => buildBookingInput(offer, fields, [], now));
  assert.doesNotThrow(() => buildBookingInput(offer, { ...fields, time: '10:30' }, [block], now));
});
test('home addresses require 5 to 240 trimmed characters', () => {
  for (const address of ['', '    ', 'abcd', 'x'.repeat(241)]) {
    assert.throws(() => buildBookingInput(offer, { ...fields, address }, [block], now));
  }
});
test('block shortcuts choose a future whole minute and reject expired or too-short blocks', () => {
  assert.equal(firstBookingStart(block, 60, now).toISOString(), start.toISOString());
  assert.equal(firstBookingStart(block, 60, start.getTime() + 1).getTime(), start.getTime() + 60000);
  assert.equal(firstBookingStart(block, 60, Date.parse(block.fin_en)), null);
  assert.equal(firstBookingStart(block, 121, now), null);
});
test('availability is public, abortable and scoped to the selected service', async () => {
  const controller = new AbortController();
  handler = async (config) => {
    assert.equal(config.url, '/servicios/service-1/disponibilidad');
    assert.equal(config.headers.Authorization, undefined);
    assert.equal(config.signal, controller.signal);
    return response(config, [block]);
  };
  assert.deepEqual(await getAvailability(offer.id, controller.signal), [block]);
});
test('creation authenticates the client and strips injected ownership, state and modality', async () => {
  handler = async (config) => {
    assert.equal(config.url, '/solicitudes');
    assert.equal(config.headers.Authorization, 'Bearer client-token');
    assert.deepEqual(JSON.parse(config.data), { servicio_id: offer.id, inicio_en: start.toISOString(), direccion_servicio: 'Calle Cliente 456' });
    return response(config, { id: 'booking-1', estado: 'PENDIENTE' });
  };
  await createBooking('client-token', { servicio_id: offer.id, inicio_en: start.toISOString(),
    direccion_servicio: 'Calle Cliente 456', cliente_id: 'intruder', estado: 'PAGADA', modalidad: 'TALLER', precio_base: 1 });
});
test('workshop creation omits the address parameter required to be absent by the backend', async () => {
  handler = async (config) => {
    assert.equal(Object.hasOwn(JSON.parse(config.data), 'direccion_servicio'), false);
    return response(config, { id: 'booking-1' });
  };
  await createBooking('client-token', { servicio_id: offer.id, inicio_en: start.toISOString() });
});
test('booking errors explain conflicts without leaking database messages', () => {
  for (const status of [401, 403, 404, 409, 422, 503, 500]) {
    const error = new axios.AxiosError('private detail', undefined, {}, undefined,
      { status, data: { detail: 'private detail' }, headers: {}, statusText: 'Error', config: {} });
    assert.equal(bookingErrorMessage(error).includes('private detail'), false);
  }
  assert.match(bookingErrorMessage(new axios.AxiosError('network')), /confirmación/);
});
test('worker availability uses local time and sends UTC instants spanning the full duration', () => {
  assert.deepEqual(buildAvailabilityInput(` ${fields.date} `, ' 09:30 ', '10:30', 60, now), {
    inicio_en: start.toISOString(), fin_en: new Date(start.getTime() + 60 * 60000).toISOString(),
  });
});
test('worker blocks reject past, invalid, reversed and too-short intervals', () => {
  assert.throws(() => buildAvailabilityInput(fields.date, '09:30', '10:30', 60, start.getTime()));
  for (const [date, from, to, duration] of [
    ['30-02-2030', '09:30', '18:00', 60], [fields.date, '24:00', '18:00', 60],
    [fields.date, '09:30', '09:30', 60], [fields.date, '18:00', '09:30', 60],
    [fields.date, '09:30', '10:29', 60], [fields.date, '09:30', '10:30', 0],
  ]) assert.throws(() => buildAvailabilityInput(date, from, to, duration, now));
});
test('publishing availability authenticates the worker and strips unrelated payload fields', async () => {
  const input = buildAvailabilityInput(fields.date, '09:30', '18:00', 60, now);
  handler = async (config) => {
    assert.equal(config.method, 'post');
    assert.equal(config.url, '/trabajador/servicios/service-1/disponibilidad');
    assert.equal(config.headers.Authorization, 'Bearer worker-token');
    assert.deepEqual(JSON.parse(config.data), input);
    return response(config, block);
  };
  assert.deepEqual(await createAvailability('worker-token', offer.id, { ...input, trabajador_id: 'another-worker' }), block);
});
test('deleting availability authenticates the worker and targets the selected service and block', async () => {
  handler = async (config) => {
    assert.equal(config.method, 'delete');
    assert.equal(config.url, '/trabajador/servicios/service-1/disponibilidad/block-1');
    assert.equal(config.headers.Authorization, 'Bearer worker-token');
    return response(config, block);
  };
  assert.deepEqual(await deleteAvailability('worker-token', offer.id, block.id), block);
});
test('availability conflicts explain the confirmed-booking restriction without leaking details', () => {
  const error = new axios.AxiosError('private detail', undefined, {}, undefined,
    { status: 409, data: { detail: 'private detail' }, headers: {}, statusText: 'Error', config: {} });
  assert.match(availabilityErrorMessage(error), /reserva confirmada/);
  assert.equal(availabilityErrorMessage(error).includes('private detail'), false);
  assert.match(availabilityErrorMessage(new axios.AxiosError('network')), /comprobar el resultado/);
});
test('dates display DD-MM-YYYY while both forms preserve the UTC backend contract', () => {
  assert.equal(fields.date, '10-01-2030');
  assert.equal(formatBookingDate(start.toISOString()), '10-01-2030 · 09:30');
  assert.equal(buildBookingInput(offer, fields, [block], now).inicio_en, start.toISOString());
  assert.equal(buildAvailabilityInput(fields.date, '09:30', '10:30', 60, now).inicio_en, start.toISOString());
});
test('hour chips only include full-duration starts inside the selected day and deduplicate blocks', () => {
  assert.deepEqual(getBookingTimes(fields.date, [block, block], 60, now), ['09:30', '10:00', '10:30']);
  assert.deepEqual(getBookingTimes('11-01-2030', [block], 60, now), []);
  assert.deepEqual(getBookingTimes('30-02-2030', [block], 60, now), []);
  assert.deepEqual(getBookingTimes(fields.date, [block], 60, start.getTime()), ['10:00', '10:30']);
});
test('every suggested time passes booking validation, including multi-day availability', () => {
  const next = new Date(2030, 0, 11, 2);
  const multiDay = { ...block, fin_en: next.toISOString() };
  for (const day of ['10-01-2030', '11-01-2030']) {
    const times = getBookingTimes(day, [multiDay], 60, now);
    assert.ok(times.length > 0);
    for (const time of times) assert.doesNotThrow(() => buildBookingInput(offer, { ...fields, date: day, time }, [multiDay], now));
  }
});
