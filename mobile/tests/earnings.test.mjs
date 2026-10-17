import assert from 'node:assert/strict';
import test from 'node:test';
import axios from 'axios';
import { currentEarningsMonth, shiftEarningsMonth, earningsMonthLabel, earningsMoney } from '../src/services/earnings.ts';
process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000/api/v1';
let handler;
axios.defaults.adapter = (config) => handler(config);
const { getWorkerEarnings, earningsError } = await import('../src/api/earnings.ts');

test('month uses Chile time at the UTC month boundary', () => {
  assert.equal(currentEarningsMonth(new Date('2026-11-01T01:00:00Z')), '2026-10');
  assert.equal(currentEarningsMonth(new Date('2026-11-01T04:00:00Z')), '2026-11');
  assert.equal(shiftEarningsMonth('2026-01', -1), '2025-12');
  assert.equal(shiftEarningsMonth('2026-12', 1), '2027-01');
  assert.match(earningsMonthLabel('2026-10'), /octubre.*2026/);
  assert.match(earningsMoney(25000), /25\.000/);
});
test('earnings endpoint sends session, pagination and abort signal without a worker ID', async () => {
  const controller = new AbortController();
  handler = async (config) => {
    assert.equal(config.url, '/trabajadores/me/ganancias');
    assert.equal(config.headers.Authorization, 'Bearer worker-token');
    assert.deepEqual(config.params, { mes: '2026-10', limit: 20, offset: 20 });
    assert.equal(config.signal, controller.signal);
    return { config, data: { total_completado: 25000 }, status: 200, statusText: 'OK', headers: {} };
  };
  assert.equal((await getWorkerEarnings('worker-token', '2026-10', 20, controller.signal)).total_completado, 25000);
});
test('invalid months and pages never reach HTTP', async () => {
  handler = () => assert.fail('Invalid request reached HTTP');
  for (const month of ['2026-13', '2026-1', '1999-01', '2101-01']) await assert.rejects(getWorkerEarnings('t', month));
  for (const offset of [-1, 0.5, NaN]) await assert.rejects(getWorkerEarnings('t', '2026-10', offset));
});
test('errors explain missing migration and session without private details', () => {
  const error = (status) => new axios.AxiosError('private', '', {}, {}, { status });
  assert.match(earningsError(error(503)), /base de datos/);
  assert.match(earningsError(error(401)), /sesión/);
  assert.doesNotMatch(earningsError(error(500)), /private/);
});
