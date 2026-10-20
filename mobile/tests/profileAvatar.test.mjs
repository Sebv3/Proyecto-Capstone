import assert from 'node:assert/strict';
import test from 'node:test';
import axios from 'axios';

process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000/api/v1';
let handler;
axios.defaults.adapter = (config) => handler(config);
const { uploadProfileAvatar, removeProfileAvatar, validateAvatar, avatarError } = await import('../src/api/profileAvatar.ts');

test('invalid image types, empty files and oversized photos are rejected locally', () => {
  for (const asset of [{ mimeType: 'image/svg+xml' }, { mimeType: 'image/jpeg', fileSize: 0 },
    { mimeType: 'image/png', fileSize: 5 * 1024 * 1024 + 1 }]) assert.throws(() => validateAvatar(asset));
  for (const mimeType of ['image/jpeg', 'image/png', 'image/webp']) {
    assert.doesNotThrow(() => validateAvatar({ mimeType, fileSize: 5 * 1024 * 1024 }));
  }
});

test('web upload sends the selected file with bearer authentication and no user id', async () => {
  const file = new File(['photo'], 'foto.png', { type: 'image/png' });
  handler = async (config) => {
    assert.equal(config.url, '/perfil/foto');
    assert.equal(config.headers.Authorization, 'Bearer own-token');
    assert.equal(config.method, 'post');
    assert.deepEqual([...config.data.keys()], ['foto']);
    assert.equal(config.data.get('foto').name, 'foto.png');
    return { config, status: 200, statusText: 'OK', headers: {}, data: { avatar_url: 'https://storage.test/photo.png' } };
  };
  assert.deepEqual(await uploadProfileAvatar('own-token', { file, mimeType: 'image/png' }), { avatar_url: 'https://storage.test/photo.png' });
});

test('invalid assets do not make network requests', async () => {
  handler = () => assert.fail('No upload expected');
  await assert.rejects(uploadProfileAvatar('token', { mimeType: 'image/svg+xml' }), /JPEG/);
});

test('native upload sends a uri, MIME type and generated safe filename', async () => {
  const OriginalFormData = globalThis.FormData;
  class NativeFormData extends OriginalFormData {
    parts = [];
    append(name, value) { this.parts.push([name, value]); }
  }
  globalThis.FormData = NativeFormData;
  try {
    handler = async (config) => {
      assert.deepEqual(config.data.parts, [['foto', {
        uri: 'file:///selected-photo.jpg', type: 'image/jpeg', name: 'perfil.jpg',
      }]]);
      return { config, status: 200, statusText: 'OK', headers: {}, data: { avatar_url: 'https://storage.test/photo.jpg' } };
    };
    await uploadProfileAvatar('own-token', { uri: 'file:///selected-photo.jpg', mimeType: 'image/jpeg', fileSize: 100 });
  } finally { globalThis.FormData = OriginalFormData; }
});

test('removal authenticates and lets the server determine which file belongs to the user', async () => {
  handler = async (config) => {
    assert.equal(config.method, 'delete');
    assert.equal(config.url, '/perfil/foto');
    assert.equal(config.headers.Authorization, 'Bearer own-token');
    assert.equal(config.data, undefined);
    return { config, status: 200, statusText: 'OK', headers: {}, data: { avatar_url: null } };
  };
  assert.deepEqual(await removeProfileAvatar('own-token'), { avatar_url: null });
});

test('errors hide storage details and explain uncertain upload results', () => {
  const error = (status) => Object.assign(new Error('private'), { isAxiosError: true, response: status ? { status, data: { detail: 'secret' } } : undefined });
  assert.match(avatarError(error()), /Recarga tu perfil/);
  assert.match(avatarError(error(401)), /sesión/);
  assert.match(avatarError(error(422)), /5 MB/);
  assert.doesNotMatch(avatarError(error(502)), /secret|private/);
});
