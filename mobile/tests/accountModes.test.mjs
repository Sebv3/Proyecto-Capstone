import assert from 'node:assert/strict';
import test from 'node:test';
import axios from 'axios';
let handler;
axios.defaults.adapter = (config) => handler(config);
const api = await import('../src/api/accountModes.ts');
const response = (config, data) => ({ status: 200, statusText: 'OK', headers: {}, config, data });

test('switch sends explicit target with session and never client-selected identity or approval', async () => {
  handler = async (config) => {
    assert.equal(config.url, '/cuenta/modo');
    assert.equal(config.headers.Authorization, 'Bearer session');
    assert.deepEqual(JSON.parse(config.data), { rol: 'CLIENTE' });
    return response(config, { id: 'account', rol: 'CLIENTE', activo: true });
  };
  assert.equal((await api.changeAccountMode('session', 'CLIENTE')).id, 'account');
});
test('admin and invalid targets are rejected without sending HTTP', async () => {
  handler = () => assert.fail('Invalid target reached API');
  for (const mode of ['ADMIN', null, '', 'trabajador']) await assert.rejects(api.changeAccountMode('session', mode));
});
test('status validates flags and supports aborting requests', async () => {
  const controller = new AbortController();
  const status = { rol_activo: 'CLIENTE', puede_ser_cliente: true, puede_ser_trabajador: true,
    tiene_perfil_trabajador: true, perfil_cliente_completo: false };
  handler = async (config) => {
    assert.equal(config.signal, controller.signal);
    assert.equal(config.headers.Authorization, 'Bearer session');
    return response(config, status);
  };
  assert.deepEqual(await api.getAccountModes('session', controller.signal), status);
  handler = async (config) => response(config, { ...status, puede_ser_trabajador: 'true' });
  await assert.rejects(api.getAccountModes('session'));
});
test('wrong mode or inactive result is not accepted as a successful switch', async () => {
  handler = async (config) => response(config, { id: 'account', rol: 'TRABAJADOR', activo: true });
  await assert.rejects(api.changeAccountMode('session', 'CLIENTE'));
  handler = async (config) => response(config, { id: 'account', rol: 'CLIENTE', activo: false });
  await assert.rejects(api.changeAccountMode('session', 'CLIENTE'));
});
test('permission and uncertain errors give safe recovery instructions', () => {
  const error = new axios.AxiosError('private', '', {}, {}, { status: 403, data: { secret: 'hidden' } });
  assert.match(api.accountModeError(error), /aprobada/);
  assert.doesNotMatch(api.accountModeError(error), /private|hidden/);
  assert.match(api.accountModeError(new axios.AxiosError('timeout')), /Actualiza/);
});

test('account deactivation sends only the current bearer token with no chosen identity', async () => {
  handler = async (config) => {
    assert.equal(config.method, 'delete');
    assert.equal(config.url, '/cuenta');
    assert.equal(config.headers.Authorization, 'Bearer worker-session');
    assert.equal(config.data, undefined);
    return response(config, undefined);
  };
  await api.deactivateAccount('worker-session');
});
test('deactivation errors explain uncertainty without exposing private details', () => {
  const error = new axios.AxiosError('private', '', {}, {}, { status: 503, data: { secret: 'hidden' } });
  assert.match(api.accountDeactivationError(error), /habilitada/);
  assert.doesNotMatch(api.accountDeactivationError(error), /private|hidden/);
  assert.match(api.accountDeactivationError(new axios.AxiosError('timeout')), /confirmar/);
});
