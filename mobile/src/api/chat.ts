import axios from 'axios';

export type ChatMessage = { id: string; conversacion_id: string; autor_id: string; contenido: string; creado_en: string; editado_en: string | null };
export type ChatPage = { solicitud_id: string; conversacion_id: string | null; contraparte_nombre: string; servicio_nombre: string; items: ChatMessage[]; limit: number; offset: number; has_more: boolean };
const api = axios.create({ baseURL: process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, ''), timeout: 15000 });
function connection() { if (!api.defaults.baseURL) throw new Error('No se ha configurado la conexión.'); }
const path = (id: string) => `/solicitudes/${encodeURIComponent(id)}/chat`;
export async function openChat(token: string, id: string, signal?: AbortSignal): Promise<ChatPage> {
  connection(); const { data } = await api.post<ChatPage>(path(id), undefined, { headers: { Authorization: `Bearer ${token}` }, signal }); return data;
}
export async function readChat(token: string, id: string, offset = 0, signal?: AbortSignal, limit = 50): Promise<ChatPage> {
  connection(); const { data } = await api.get<ChatPage>(path(id), { headers: { Authorization: `Bearer ${token}` }, params: { limit, offset }, signal }); return data;
}
export async function sendChatMessage(token: string, id: string, messageId: string, content: string): Promise<ChatMessage> {
  connection(); const { data } = await api.post<ChatMessage>(path(id) + '/mensajes', { id: messageId, contenido: content.trim() }, { headers: { Authorization: `Bearer ${token}` } }); return data;
}
export async function editChatMessage(token: string, id: string, messageId: string, content: string): Promise<ChatMessage> {
  connection(); const { data } = await api.patch<ChatMessage>(path(id) + `/mensajes/${encodeURIComponent(messageId)}`, { contenido: content.trim() }, { headers: { Authorization: `Bearer ${token}` } }); return data;
}
export async function deleteChatMessage(token: string, id: string, messageId: string): Promise<void> {
  connection(); await api.delete(path(id) + `/mensajes/${encodeURIComponent(messageId)}`, { headers: { Authorization: `Bearer ${token}` } });
}
export function isChatClosed(error: unknown): boolean { return axios.isAxiosError(error) && error.response?.status === 410; }
export function chatError(error: unknown): string {
  if (isChatClosed(error)) return 'El servicio terminó. La conversación y sus mensajes fueron eliminados.';
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'No recibimos confirmación. Actualiza el chat antes de reintentar.';
    if (error.response.status === 404 || error.response.status === 403) return 'No tienes acceso a esta conversación o mensaje.';
    if (error.response.status === 401) return 'Tu sesión venció. Inicia sesión nuevamente.';
    if (error.response.status === 503) return 'El chat no está disponible en este momento.';
    if (error.response.status === 409) return 'El mensaje cambió. Actualiza el chat.';
  }
  return 'No pudimos consultar o actualizar el chat. Inténtalo nuevamente.';
}
// This UUID is an idempotency key, not a secret or authentication credential.
export function newMessageId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (value) => {
    const random = Math.floor(Math.random() * 16);
    return (value === 'x' ? random : (random & 3) | 8).toString(16);
  });
}
