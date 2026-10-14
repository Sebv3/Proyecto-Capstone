import assert from 'node:assert/strict';
import test from 'node:test';
import axios from 'axios';
process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000/api/v1';
let handler;
axios.defaults.adapter = (config) => handler(config);
const api = await import('../src/api/chat.ts');
const response = (config, data) => ({ config, data, status: 200, statusText: 'OK', headers: {} });

test('chat opening and paginated reading authenticate and are abortable', async () => {
  const controller = new AbortController();
  handler = async (config) => {
    assert.equal(config.url, '/solicitudes/booking%2F1/chat');
    assert.equal(config.headers.Authorization, 'Bearer participant');
    assert.equal(config.signal, controller.signal);
    if (config.method === 'get') assert.deepEqual(config.params, { limit: 50, offset: 50 });
    return response(config, { items: [] });
  };
  await api.openChat('participant', 'booking/1', controller.signal);
  await api.readChat('participant', 'booking/1', 50, controller.signal);
});

test('messages preserve an idempotency key without sending author or conversation ownership', async () => {
  const id = api.newMessageId();
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  handler = async (config) => {
    assert.equal(config.headers.Authorization, 'Bearer participant');
    assert.deepEqual(JSON.parse(config.data), { id, contenido: 'Hola' });
    return response(config, { id, contenido: 'Hola' });
  };
  await api.sendChatMessage('participant', 'booking-1', id, ' Hola ');
  await api.sendChatMessage('participant', 'booking-1', id, ' Hola ');
});

test('editing replaces content and deleting sends no hidden history or identity', async () => {
  handler = async (config) => {
    assert.equal(config.url, '/solicitudes/booking-1/chat/mensajes/message-1');
    if (config.method === 'patch') assert.deepEqual(JSON.parse(config.data), { contenido: 'Nuevo' });
    else { assert.equal(config.method, 'delete'); assert.equal(config.data, undefined); }
    return response(config, { id: 'message-1' });
  };
  await api.editChatMessage('participant', 'booking-1', 'message-1', ' Nuevo ');
  await api.deleteChatMessage('participant', 'booking-1', 'message-1');
});

test('closed conversations signal deletion without exposing internal error data', () => {
  const error = new axios.AxiosError('private', '', {}, {}, { status: 410, data: { secret: 'hidden' } });
  assert.equal(api.isChatClosed(error), true);
  assert.match(api.chatError(error), /eliminados/);
  assert.doesNotMatch(api.chatError(error), /hidden|private/);
});
