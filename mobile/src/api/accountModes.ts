import axios from 'axios';
import type { User } from './auth';

export type AccountMode = 'CLIENTE' | 'TRABAJADOR';
export type AccountModes = {
  rol_activo: AccountMode; puede_ser_cliente: boolean; puede_ser_trabajador: boolean;
  tiene_perfil_trabajador: boolean; perfil_cliente_completo: boolean;
};
const api = axios.create({ baseURL: process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, ''), timeout: 15000 });
export async function deactivateAccount(token: string): Promise<void> {
  await api.delete('/cuenta', { headers: { Authorization: `Bearer ${token}` } });
}
export function accountDeactivationError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 401) return 'Tu sesión venció. Inicia sesión nuevamente.';
    if (error.response?.status === 503) return 'La desactivación aún no está habilitada en el servidor.';
    if (error.response?.status === 403) return 'No tienes permiso para desactivar esta cuenta.';
  }
  return 'No pudimos confirmar la desactivación. Actualiza tu perfil antes de volver a intentarlo.';
}
export async function getAccountModes(token: string, signal?: AbortSignal): Promise<AccountModes> {
  const { data } = await api.get<AccountModes>('/cuenta/modos', { headers: { Authorization: `Bearer ${token}` }, signal });
  if (!['CLIENTE', 'TRABAJADOR'].includes(data.rol_activo)
    || ['puede_ser_cliente', 'puede_ser_trabajador', 'tiene_perfil_trabajador', 'perfil_cliente_completo']
      .some((key) => typeof data[key as keyof AccountModes] !== 'boolean')) throw new Error('Respuesta de modos inválida.');
  return data;
}
export async function changeAccountMode(token: string, mode: AccountMode): Promise<User> {
  if (!['CLIENTE', 'TRABAJADOR'].includes(mode)) throw new Error('Modo no permitido.');
  const { data } = await api.post<User>('/cuenta/modo', { rol: mode }, { headers: { Authorization: `Bearer ${token}` } });
  if (!data.id || data.rol !== mode || data.activo !== true) throw new Error('No se pudo comprobar el cambio de modo.');
  return data;
}
export function accountModeError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 401) return 'Tu sesión venció. Inicia sesión nuevamente.';
    if (error.response?.status === 403) return 'Para volver a trabajador necesitas que tu verificación esté aprobada y tu cuenta activa.';
    if (error.response?.status === 503) return 'El cambio de modo aún no está habilitado en el servidor.';
  }
  return 'No pudimos confirmar el cambio. Actualiza el perfil antes de intentarlo de nuevo.';
}
