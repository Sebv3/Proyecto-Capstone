import axios from 'axios';
import type { Booking } from './bookings';

type PaymentAmounts = { tarifa_base: number; comision: number; monto_total: number; moneda: 'CLP'; simulado: true };
export type Payment = PaymentAmounts & {
  proveedor?: 'SIMULADO' | 'MERCADO_PAGO_TEST'; proveedor_pago_id?: string | null;
  id: string; solicitud_id: string; cliente_id: string; trabajador_id: string;
  estado: 'APROBADO'; creado_en: string;
};
export type PaymentSummary = PaymentAmounts & { pago: Payment | null };
export type PaymentResult = { pago: Payment; solicitud: Booking };
const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, ''), timeout: 15000,
});
function requireConnection() {
  if (!api.defaults.baseURL) throw new Error('No se ha configurado la conexión con el servicio.');
}
export async function getPaymentSummary(token: string, bookingId: string, signal?: AbortSignal): Promise<PaymentSummary> {
  requireConnection();
  const { data } = await api.get<PaymentSummary>(`/solicitudes/${encodeURIComponent(bookingId)}/pago`, {
    headers: { Authorization: `Bearer ${token}` }, signal,
  });
  return data;
}
export async function simulatePayment(token: string, bookingId: string): Promise<PaymentResult> {
  requireConnection();
  const { data } = await api.post<PaymentResult>(`/solicitudes/${encodeURIComponent(bookingId)}/pago/simular`, {}, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}
export function paymentErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'No recibimos confirmación del pago simulado. Actualiza el estado antes de reintentar.';
    switch (error.response.status) {
      case 401: return 'Tu sesión venció. Inicia sesión para continuar.';
      case 403: return 'Solo el cliente dueño de la solicitud puede simular su pago.';
      case 404: return 'Solicitud no encontrada o fuera de tu cuenta.';
      case 409: return 'La solicitud ya no admite pago. Actualiza su estado.';
      case 503: return 'Los pagos simulados todavía no están disponibles. Inténtalo más tarde.';
      default: return 'No pudimos consultar o registrar el pago simulado. Inténtalo nuevamente.';
    }
  }
  return 'No pudimos consultar o registrar el pago simulado. Inténtalo nuevamente.';
}
