import axios from 'axios';

export type PaymentMode = 'SIMULADO' | 'MERCADO_PAGO_TEST';
export type MercadoPagoCheckout = {
  id: string; solicitud_id: string; estado: 'CREANDO' | 'LISTO' | 'PENDIENTE' | 'RECHAZADO' | 'APROBADO' | 'REVISION';
  checkout_url: string | null; expira_en: string;
};
const api = axios.create({ baseURL: process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, ''), timeout: 45000 });
export async function getPaymentMode(signal?: AbortSignal): Promise<PaymentMode> {
  const { data } = await api.get<{ modo: PaymentMode }>('/pagos/configuracion', { signal });
  if (!['SIMULADO', 'MERCADO_PAGO_TEST'].includes(data.modo)) throw new Error('Configuración de pago inválida.');
  return data.modo;
}
export async function getMercadoPagoCheckout(token: string, bookingId: string, signal?: AbortSignal): Promise<MercadoPagoCheckout | null> {
  const { data } = await api.get<MercadoPagoCheckout | null>(`/solicitudes/${encodeURIComponent(bookingId)}/pago/mercadopago`, {
    headers: { Authorization: `Bearer ${token}` }, signal,
  });
  return data;
}
export async function syncMercadoPagoCheckout(token: string, bookingId: string, signal?: AbortSignal): Promise<MercadoPagoCheckout | null> {
  const { data } = await api.post<MercadoPagoCheckout | null>(`/solicitudes/${encodeURIComponent(bookingId)}/pago/mercadopago/sincronizar`, {}, {
    headers: { Authorization: `Bearer ${token}` }, signal,
  });
  return data;
}
export async function createMercadoPagoCheckout(token: string, bookingId: string): Promise<MercadoPagoCheckout> {
  const { data } = await api.post<MercadoPagoCheckout>(`/solicitudes/${encodeURIComponent(bookingId)}/pago/mercadopago`, {}, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}
export function safeCheckoutUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !['www.mercadopago.cl', 'www.mercadopago.com'].includes(url.hostname)
      || url.username || url.password || (url.port && url.port !== '443')) throw new Error('Dirección de pago no válida.');
  return value;
}
export function mercadoPagoError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 401) return 'Tu sesión venció. Inicia sesión nuevamente.';
    if (error.response?.status === 403) return 'Solo el cliente de la solicitud puede iniciar el pago.';
    if (error.response?.status === 409) return 'El checkout está en preparación o la solicitud ya no admite pago. Actualiza su estado antes de reintentar.';
    if (error.response?.status === 503) return 'Mercado Pago de prueba aún no está habilitado. Revisa la configuración del backend y la migración.';
  }
  return 'No recibimos confirmación de Mercado Pago. Actualiza el estado antes de reintentar.';
}
