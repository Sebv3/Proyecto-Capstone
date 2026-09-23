import assert from 'node:assert/strict';
import test from 'node:test';
import axios from 'axios';

process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000/api/v1';
let handler;
axios.defaults.adapter = (config) => handler(config);
const {
  getCommunes, login, loginErrorMessage, refreshSession, register, registerErrorMessage,
} = await import('../src/api/auth.ts');
const { registerSchema } = await import('../src/auth/registerSchema.ts');
const {
  clientProfileErrorMessage, getClientProfile,
} = await import('../src/api/clientProfile.ts');
const { clearStoredSession, readStoredSession, saveSession } = await import('../src/auth/sessionStorage.web.ts');
const user = { id: 'user-1', nombre: 'Ana', email: 'ana@example.com', rol: 'CLIENTE', activo: true };
const sessionResponse = {
  access_token: 'test-token', refresh_token: 'refresh-token', token_type: 'bearer', expires_in: 3600,
};
const response = (config, data) => ({ config, data, status: 200, statusText: 'OK', headers: {} });

const registration = {
  nombre: ' Ana ', email: 'ana@example.com', rut: '12.345.678-5',
  password: 'test-only', confirmPassword: 'test-only', rol: 'CLIENTE',
  direccion: ' Avenida Siempre Viva 123 ',
  comuna_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
};

const browserStorage = new Map();
globalThis.sessionStorage = {
  getItem: (key) => browserStorage.get(key) ?? null,
  setItem: (key, value) => browserStorage.set(key, value),
  removeItem: (key) => browserStorage.delete(key),
  clear: () => browserStorage.clear(),
  key: (index) => [...browserStorage.keys()][index] ?? null,
  get length() { return browserStorage.size; },
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
    { direccion: '' }, { comuna_id: '' },
  ]) assert.equal(registerSchema.safeParse({ ...registration, ...change }).success, false);
});

test('worker registration does not require client address fields', () => {
  const parsed = registerSchema.parse({
    ...registration, rol: 'TRABAJADOR', direccion: '', comuna_id: '',
  });
  assert.equal(parsed.rol, 'TRABAJADOR');
});

test('registration loads the commune catalog before authentication', async () => {
  const communes = [
    { id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', nombre: 'Santiago' },
  ];
  handler = async (config) => {
    assert.equal(config.url, '/comunas');
    assert.equal(config.headers.Authorization, undefined);
    return response(config, communes);
  };
  assert.deepEqual(await getCommunes(), communes);
});

test('registration sends only API fields and handles email confirmation on or off', async () => {
  for (const confirmation of [true, false]) {
    handler = async (config) => {
      assert.equal(config.url, '/auth/register');
      assert.deepEqual(JSON.parse(config.data), {
        nombre: 'Ana', email: 'ana@example.com', rut: '12345678-5', password: 'test-only', rol: 'CLIENTE',
        direccion: 'Avenida Siempre Viva 123',
        comuna_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
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
      return response(config, sessionResponse);
    }
    assert.equal(config.headers.Authorization, 'Bearer test-token');
    return response(config, { user });
  };
  const authenticated = await login('ana@example.com', 'test-only');
  assert.deepEqual(authenticated.user, user);
  assert.deepEqual(
    { ...authenticated.session, expires_at: undefined },
    { ...sessionResponse, expires_at: undefined },
  );
  assert.ok(authenticated.session.expires_at > Date.now());
  assert.deepEqual(calls, ['/auth/login', '/auth/me']);
});

test('refresh rotates the session tokens and calculates their expiration', async () => {
  handler = async (config) => {
    assert.equal(config.url, '/auth/refresh');
    assert.deepEqual(JSON.parse(config.data), { refresh_token: 'old-refresh-token' });
    return response(config, {
      ...sessionResponse, access_token: 'new-access-token', refresh_token: 'new-refresh-token',
    });
  };
  const refreshed = await refreshSession('old-refresh-token');
  assert.equal(refreshed.access_token, 'new-access-token');
  assert.equal(refreshed.refresh_token, 'new-refresh-token');
  assert.ok(refreshed.expires_at > Date.now());
});

test('web session storage saves, reads, and clears the session for the current tab', async () => {
  const session = { ...sessionResponse, expires_at: Date.now() + 3_600_000 };
  await saveSession(session);
  assert.deepEqual(await readStoredSession(), session);
  await clearStoredSession();
  assert.equal(await readStoredSession(), null);
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
    ? sessionResponse : { user: { ...user, activo: false } });
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

test('client profile is retrieved with the current access token', async () => {
  const profile = {
    usuario_id: 'user-1', email: 'ana@example.com', nombre: 'Ana', rut: '12345678-5',
    telefono: null, avatar_url: null, direccion: 'Avenida Siempre Viva 123',
    comuna: { id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', nombre: 'Santiago' },
    activo: true, creado_en: '2026-09-22T12:00:00Z', actualizado_en: '2026-09-22T12:00:00Z',
  };
  handler = async (config) => {
    assert.equal(config.url, '/perfiles/cliente');
    assert.equal(config.headers.Authorization, 'Bearer test-token');
    return response(config, profile);
  };
  assert.deepEqual(await getClientProfile('test-token'), profile);
});

test('client profile errors are readable and do not expose private details', () => {
  const error = new axios.AxiosError('Request failed', undefined, undefined, undefined, {
    status: 404, data: { detail: 'private upstream details' }, statusText: '', headers: {}, config: {},
  });
  assert.match(clientProfileErrorMessage(error), /todavía no está completo/);
  assert.doesNotMatch(clientProfileErrorMessage(error), /private upstream/);
});
