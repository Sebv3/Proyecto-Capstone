import assert from 'node:assert/strict';
import test from 'node:test';
import axios from 'axios';

process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000/api/v1';
let handler;
axios.defaults.adapter = (config) => handler(config);
const { requestPasswordRecovery, resetPassword, passwordRecoveryErrorMessage } = await import('../src/api/auth.ts');
const { recoveryEmailSchema, passwordResetSchema } = await import('../src/auth/passwordRecoverySchema.ts');
const valid = { email: ' persona@example.com ', code: '123456', password: 'changed-secret', confirmPassword: 'changed-secret' };

test('validates email, numeric code and matching passwords before reset', () => {
  assert.equal(recoveryEmailSchema.parse(valid.email), 'persona@example.com');
  assert.equal(passwordResetSchema.parse(valid).email, 'persona@example.com');
  for (const change of [{ email: 'bad' }, { code: '12345' }, { code: 'abcdef' }, { password: 'short' }, { confirmPassword: 'other' }]) {
    assert.equal(passwordResetSchema.safeParse({ ...valid, ...change }).success, false);
  }
});

test('recovery uses its own endpoints and never logs in or stores a session', async () => {
  const calls = [];
  handler = async (config) => {
    calls.push([config.url, JSON.parse(config.data)]);
    assert.equal(config.headers.Authorization, undefined);
    return { data: { message: 'OK' }, status: 200, headers: {}, config, statusText: 'OK' };
  };
  await requestPasswordRecovery(valid.email);
  await resetPassword(valid.email, valid.code, valid.password);
  assert.deepEqual(calls, [
    ['/auth/password-recovery', { email: 'persona@example.com' }],
    ['/auth/password-reset', { email: 'persona@example.com', code: '123456', password: 'changed-secret' }],
  ]);
});

test('recovery explains expired codes, throttling and uncertain network results', () => {
  const error = (status, detail) => new axios.AxiosError('error', undefined, undefined, undefined,
    { status, data: { detail }, headers: {}, config: {}, statusText: '' });
  assert.equal(passwordRecoveryErrorMessage(error(400, 'El código venció.')), 'El código venció.');
  assert.match(passwordRecoveryErrorMessage(error(429, 'private')), /Demasiados intentos/);
  assert.match(passwordRecoveryErrorMessage(new axios.AxiosError('network')), /prueba iniciar sesión con la nueva/);
});
