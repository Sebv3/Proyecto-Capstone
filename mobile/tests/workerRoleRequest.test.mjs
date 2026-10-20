import assert from 'node:assert/strict';
import test from 'node:test';
import { showWorkerRoleRequest } from '../src/services/workerRoleRequest.ts';

test('a client who previously became a worker does not see the old approval card', () => {
  const historical = { estado: 'APROBADA' };
  assert.equal(showWorkerRoleRequest('CLIENTE', historical), false);
  assert.equal(historical.estado, 'APROBADA');
});

test('clients can still request the role or follow pending and rejected submissions', () => {
  assert.equal(showWorkerRoleRequest('CLIENTE', null), true);
  assert.equal(showWorkerRoleRequest('CLIENTE', { estado: 'PENDIENTE' }), true);
  assert.equal(showWorkerRoleRequest('CLIENTE', { estado: 'RECHAZADA' }), true);
});

test('the invitation is never shown for workers or administrators', () => {
  for (const role of ['TRABAJADOR', 'ADMIN']) {
    for (const request of [null, { estado: 'PENDIENTE' }, { estado: 'APROBADA' }, { estado: 'RECHAZADA' }]) {
      assert.equal(showWorkerRoleRequest(role, request), false);
    }
  }
});
