import assert from 'node:assert/strict';
import test from 'node:test';
import axios from 'axios';
process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000/api/v1';
let handler;
axios.defaults.adapter = (config) => handler(config);
const { getNotifications, unreadNotificationCount, readNotifications, notificationError } = await import('../src/api/notifications.ts');
const response = (config, data) => ({ config, data, status: 200, statusText: 'OK', headers: {} });

test('notification queries authenticate, paginate and support abort', async () => {
  const controller = new AbortController();
  handler = async (config) => {
    assert.equal(config.headers.Authorization, 'Bearer token');
    assert.equal(config.signal, controller.signal);
    assert.deepEqual(config.params, { limit: 20, offset: 20 });
    return response(config, []);
  };
  assert.deepEqual(await getNotifications('token', 20, controller.signal), []);
});

test('badge uses an actual unread count and rejects invalid counts', async () => {
  handler = async (config) => {
    assert.equal(config.url, '/notificaciones/sin-leer');
    assert.equal(config.headers.Authorization, 'Bearer token');
    return response(config, { cantidad: 8 });
  };
  assert.equal(await unreadNotificationCount('token'), 8);
  for (const cantidad of [-1, 1.5, '8', undefined]) {
    handler = async (config) => response(config, { cantidad });
    await assert.rejects(unreadNotificationCount('token'), /inválida/);
  }
});

test('read one or all without choosing a recipient or sending a timestamp', async () => {
  const calls = [];
  handler = async (config) => {
    calls.push(config.url);
    assert.equal(config.headers.Authorization, 'Bearer token');
    assert.equal(config.data, undefined);
    return response(config, { ok: true });
  };
  await readNotifications('token', 'notification-id');
  await readNotifications('token');
  assert.deepEqual(calls, ['/notificaciones/notification-id/leer', '/notificaciones/leer-todas']);
});

test('missing migration is explained without exposing upstream details', () => {
  const error = new axios.AxiosError('private', undefined, undefined, undefined, { status: 503 });
  assert.match(notificationError(error), /todavía no están disponibles/);
});
