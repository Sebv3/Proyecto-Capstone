import type { WorkerRoleRequest } from '../api/workerRoleRequest';

// An approval describes a completed change, not a request that is still active.
// If the account is a client again, retain that record only as history.
export function showWorkerRoleRequest(
  role: string, request: WorkerRoleRequest | null,
): boolean {
  return role === 'CLIENTE' && request?.estado !== 'APROBADA';
}
