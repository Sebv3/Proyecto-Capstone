import type { Booking } from '../api/bookings';

export function paymentUnavailableReason(
  booking: Pick<Booking, 'estado' | 'inicio_en'>, now = Date.now(),
): string | null {
  if (booking.estado !== 'ACEPTADA') return 'La solicitud ya no está pendiente de pago. Actualiza su estado.';
  const start = Date.parse(booking.inicio_en);
  if (!Number.isFinite(start)) return 'No pudimos verificar la fecha de la cita. Actualiza la solicitud.';
  if (start <= now) return 'La hora de esta cita ya pasó. Cancela la solicitud y agenda un nuevo horario futuro para poder pagar.';
  return null;
}
