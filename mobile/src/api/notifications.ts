import axios from 'axios';

export type Notification = {
  id: string; tipo: 'SOLICITUD' | 'VERIFICACION' | 'CERTIFICACION' | 'ROL';
  referencia_id: string; categoria_id: string | null; titulo: string; mensaje: string;
  creado_en: string; leida_en: string | null;
};
const api = axios.create({ baseURL: process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, ''), timeout: 15000 });
function connection() {
  if (!api.defaults.baseURL) throw new Error('No se ha configurado la conexión con el servicio.');
}
export async function getNotifications(token: string, offset = 0, signal?: AbortSignal): Promise<Notification[]> {
  connection();
  const { data } = await api.get<Notification[]>('/notificaciones', {
    headers: { Authorization: `Bearer ${token}` }, params: { limit: 20, offset }, signal,
  });
  return data;
}
export async function unreadNotificationCount(token: string, signal?: AbortSignal): Promise<number> {
  connection();
  const { data } = await api.get<{ cantidad: number }>('/notificaciones/sin-leer', {
    headers: { Authorization: `Bearer ${token}` }, signal,
  });
  if (!Number.isInteger(data.cantidad) || data.cantidad < 0) throw new Error('Respuesta de notificaciones inválida.');
  return data.cantidad;
}
export async function readNotifications(token: string, id?: string): Promise<void> {
  connection();
  await api.post(id ? `/notificaciones/${encodeURIComponent(id)}/leer` : '/notificaciones/leer-todas', undefined,
    { headers: { Authorization: `Bearer ${token}` } });
}
export async function clearNotifications(token: string): Promise<number> {
  connection();
  const { data } = await api.delete<{ eliminadas: number }>('/notificaciones', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!Number.isInteger(data.eliminadas) || data.eliminadas < 0) throw new Error('Respuesta de notificaciones inválida.');
  return data.eliminadas;
}
export function notificationError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'No pudimos conectar. Revisa tu conexión y vuelve a intentar.';
    if (error.response.status === 503) return 'Las notificaciones todavía no están disponibles.';
    if (error.response.status === 401) return 'Tu sesión venció. Inicia sesión para continuar.';
  }
  return 'No pudimos actualizar las notificaciones. Vuelve a intentar.';
}
