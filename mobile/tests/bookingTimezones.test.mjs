import assert from 'node:assert/strict';
import test from 'node:test';

process.env.TZ = 'America/Santiago';
const { parseBookingTime, bookingDayRange, getBookingTimes, buildBookingInput } =
  await import('../src/services/bookingForm.ts');

test('Chile spring clock change rejects the nonexistent local midnight', () => {
  assert.equal(parseBookingTime('06-09-2026', '00:30'), null);
  assert.ok(parseBookingTime('06-09-2026', '01:00'));
  const range = bookingDayRange('06-09-2026');
  assert.equal(Date.parse(range.hasta) - Date.parse(range.desde), 23 * 3600000);
});

test('Chile fall clock change preserves the 25-hour local day in agenda filters', () => {
  const range = bookingDayRange('04-04-2026');
  assert.equal(Date.parse(range.hasta) - Date.parse(range.desde), 25 * 3600000);
});

test('repeated Chilean local times never expose a second ambiguous booking instant', () => {
  const offer = { id: 'service', modalidad: 'DOMICILIO', duracion_estimada_minutos: 30,
    ubicacion_publica: 'Sector Plaza Central' };
  const block = { id: 'block', servicio_id: 'service', inicio_en: '2026-04-05T02:00:00Z',
    fin_en: '2026-04-05T04:00:00Z' };
  const now = Date.parse('2026-04-03T12:00:00Z');
  const times = getBookingTimes('04-04-2026', [block], 30, now);
  assert.deepEqual(times, ['23:00', '23:30']);
  for (const time of times) {
    const input = buildBookingInput(offer, { date: '04-04-2026', time, address: 'Client address 123' },
      [block], now);
    assert.equal(input.inicio_en, parseBookingTime('04-04-2026', time).toISOString());
    assert.ok(Date.parse(input.inicio_en) < Date.parse('2026-04-05T03:00:00Z'));
  }
});
