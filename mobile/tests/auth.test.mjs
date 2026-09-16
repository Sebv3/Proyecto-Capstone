import assert from 'node:assert/strict';
import test from 'node:test';
import axios from 'axios';

process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000/api/v1';
let handler;
axios.defaults.adapter = (config) => handler(config);
const { login, loginErrorMessage, register, registerErrorMessage } = await import('../src/api/auth.ts');
const { registerSchema } = await import('../src/auth/registerSchema.ts');
const user = { id: 'user-1', nombre: 'Ana', email: 'ana@example.com', rol: 'CLIENTE', activo: true };
const response = (config, data) => ({ config, data, status: 200, statusText: 'OK', headers: {} });

const registration = {
  nombre: ' Ana ', email: 'ana@example.com', rut: '12.345.678-5',
  password: 'test-only', confirmPassword: 'test-only', rol: 'CLIENTE',
};

test('registration validates both roles and normalizes the RUT', () => {
  for (const rol of ['CLIENTE', 'TRABAJADOR']) {
    const parsed = registerSchema.parse({ ...registration, rol });
    assert.equal(parsed.rut, '12345678-5');
    assert.equal(parsed.nombre, 'Ana');
    assert.equal(parsed.rol, rol);
  }
  for (const rut of ['6.000.000-k', '10.000.004-0']) {
    assert.equal(registerSchema.safeParse({ ...registration, rut }).success, true);
  }
});

test('registration rejects invalid RUT, missing role, admin, and mismatched passwords', () => {
  for (const change of [
    { rut: '12.345.678-0' }, { rol: undefined }, { rol: 'ADMIN' },
    { confirmPassword: 'different' }, { password: 'short', confirmPassword: 'short' },
    { email: 'invalid' }, { nombre: ' ' },
  ]) assert.equal(registerSchema.safeParse({ ...registration, ...change }).success, false);
});

test('registration sends only API fields and handles email confirmation on or off', async () => {
  for (const confirmation of [true, false]) {
    handler = async (config) => {
      assert.equal(config.url, '/auth/register');
      assert.deepEqual(JSON.parse(config.data), {
        nombre: 'Ana', email: 'ana@example.com', rut: '12345678-5', password: 'test-only', rol: 'CLIENTE',
      });
      return response(config, { user_id: 'user-1', email_confirmation_required: confirmation, session: { access_token: 'private' } });
    };
    assert.deepEqual(await register(registerSchema.parse(registration)), {
      user_id: 'user-1', email_confirmation_required: confirmation,
    });
  }
});

test('registration errors do not expose upstream details', () => {
  const error = new axios.AxiosError('Request failed', undefined, undefined, undefined, {
    status: 400, data: { detail: 'private database details' }, statusText: '', headers: {}, config: {},
  });
  assert.match(registerErrorMessage(error), /Revisa tus datos/);
  assert.doesNotMatch(registerErrorMessage(error), /private/);
});

test('login retrieves the profile with the issued token before granting access', async () => {
  const calls = [];
  handler = async (config) => {
    calls.push(config.url);
    if (config.url === '/auth/login') {
      assert.deepEqual(JSON.parse(config.data), { email: 'ana@example.com', password: 'test-only' });
      return response(config, { access_token: 'test-token' });
    }
    assert.equal(config.headers.Authorization, 'Bearer test-token');
    return response(config, { user });
  };
  assert.deepEqual(await login('ana@example.com', 'test-only'), user);
  assert.deepEqual(calls, ['/auth/login', '/auth/me']);
});

test('failed login never queries the profile', async () => {
  let calls = 0;
  handler = async (config) => {
    calls++;
    throw new axios.AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, null, {
      ...response(config, {}), status: 401,
    });
  };
  await assert.rejects(login('ana@example.com', 'wrong'));
  assert.equal(calls, 1);
});

test('an inactive profile does not grant access', async () => {
  handler = async (config) => response(config, config.url === '/auth/login'
    ? { access_token: 'test-token' } : { user: { ...user, activo: false } });
  await assert.rejects(login('ana@example.com', 'test-only'), /perfil/);
});

test('API failures produce readable errors without exposing response bodies', () => {
  for (const [status, detail, expected] of [
    [403, 'Confirma tu correo antes de iniciar sesión', /Confirma tu correo/],
    [403, 'Cuenta inactiva', /inactiva/],
    [429, 'private upstream details', /Demasiados intentos/],
    [500, 'private upstream details', /Inténtalo más tarde/],
  ]) {
    const error = new axios.AxiosError('Request failed', undefined, undefined, undefined, {
      status, data: { detail }, statusText: '', headers: {}, config: {},
    });
    assert.match(loginErrorMessage(error), expected);
    assert.doesNotMatch(loginErrorMessage(error), /private upstream/);
  }
  assert.match(loginErrorMessage(new axios.AxiosError('Network Error')), /conectar/);
});
