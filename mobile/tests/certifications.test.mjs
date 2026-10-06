import assert from 'node:assert/strict';
import test from 'node:test';
import axios from 'axios';

process.env.EXPO_PUBLIC_API_URL = 'http://localhost:8000/api/v1';
let handler;
axios.defaults.adapter = (config) => handler(config);
const { getWorkerCertifications, submitWorkerCertification, certificationErrorMessage } = await import('../src/api/workerCertifications.ts');
const { certificationFileError, canPublishInCategory } = await import('../src/services/certificationRules.ts');
const { workerServicesErrorMessage } = await import('../src/api/workerServices.ts');
const response = (config, data) => ({ config, data, status: 200, statusText: 'OK', headers: {} });

test('certification approval is mandatory only for its matching category', () => {
  const category = { id: 'electricidad', requiere_certificacion: true };
  for (const certifications of [[], [{ categoria_id: 'electricidad', estado: 'PENDIENTE' }],
    [{ categoria_id: 'electricidad', estado: 'RECHAZADA' }], [{ categoria_id: 'gas', estado: 'APROBADA' }]]) {
    assert.equal(canPublishInCategory(category, certifications), false);
  }
  assert.equal(canPublishInCategory(category, [{ categoria_id: 'electricidad', estado: 'APROBADA' }]), true);
  assert.equal(canPublishInCategory({ id: 'pintura', requiere_certificacion: false }, []), true);
});

test('certification picker accepts supported documents and checks size boundaries', () => {
  for (const mimeType of ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']) {
    assert.equal(certificationFileError({ mimeType, size: 5 * 1024 * 1024 }), null);
    assert.equal(certificationFileError({ mimeType }), null);
    assert.match(certificationFileError({ mimeType, size: 0 }), /contenido/);
    assert.match(certificationFileError({ mimeType, size: 5 * 1024 * 1024 + 1 }), /5 MB/);
  }
  assert.match(certificationFileError({ mimeType: 'text/html', size: 100 }), /PDF/);
});

test('certification listing uses the current worker session', async () => {
  handler = async (config) => {
    assert.equal(config.url, '/trabajador/certificaciones');
    assert.equal(config.headers.Authorization, 'Bearer worker-token');
    return response(config, [{ id: 'cert-1', estado: 'PENDIENTE' }]);
  };
  assert.equal((await getWorkerCertifications('worker-token'))[0].estado, 'PENDIENTE');
});

test('document upload submits a private multipart request without approval or worker identity fields', async () => {
  const file = new Blob(['%PDF-1.7'], { type: 'application/pdf' });
  handler = async (config) => {
    assert.equal(config.method, 'post');
    assert.equal(config.headers.Authorization, 'Bearer worker-token');
    assert.ok(config.data instanceof FormData);
    assert.deepEqual([...config.data.keys()], ['categoria_id', 'nombre', 'documento']);
    assert.equal(config.data.get('categoria_id'), 'category-1');
    assert.equal(config.data.get('nombre'), 'Licencia SEC');
    assert.equal(await config.data.get('documento').text(), '%PDF-1.7');
    return response(config, { id: 'cert-1', estado: 'PENDIENTE' });
  };
  const result = await submitWorkerCertification('worker-token', 'category-1', ' Licencia SEC ', {
    uri: 'file.pdf', name: 'license.pdf', mimeType: 'application/pdf', file,
  });
  assert.equal(result.estado, 'PENDIENTE');
});

test('certification errors are readable and do not leak server payloads', () => {
  for (const [status, expected] of [[409, /pendiente o aprobada/], [422, /5 MB/], [503, /administrador/], [403, /cuenta/], [502, /Inténtalo/]]) {
    const error = new axios.AxiosError('failed', undefined, undefined, undefined, {
      status, data: { detail: 'private database details' }, config: {}, headers: {}, statusText: '',
    });
    assert.match(certificationErrorMessage(error), expected);
    assert.doesNotMatch(certificationErrorMessage(error), /private|database/);
  }
  const missingApproval = new axios.AxiosError('failed', undefined, undefined, undefined, {
    status: 403, data: { detail: 'La categoría requiere una certificación aprobada' }, config: {}, headers: {}, statusText: '',
  });
  assert.match(workerServicesErrorMessage(missingApproval), /certificación aprobada/);
});
