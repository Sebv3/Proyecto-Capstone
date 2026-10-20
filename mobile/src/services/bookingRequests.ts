import type { Booking, BookingStatus, BookingView } from '../api/bookings';

export const bookingViewStates: Record<BookingView, BookingStatus[]> = {
  activas: ['PENDIENTE', 'ACEPTADA', 'PAGADA', 'EN_CAMINO', 'EN_CURSO', 'LISTO'],
  historial: ['COMPLETADA', 'CANCELADA', 'RECHAZADA'],
};

export function bookingAttention(booking: Booking, now = Date.now()): string | null {
  if (['PENDIENTE', 'ACEPTADA'].includes(booking.estado) && Date.parse(booking.inicio_en) < now) {
    return 'Fecha de atención vencida';
  }
  if (booking.estado === 'ACEPTADA') return 'Pendiente de tu pago';
  if (booking.estado === 'LISTO') return booking.modalidad === 'TALLER'
    ? 'Listo para retirar y confirmar' : 'Pendiente de tu confirmación';
  return null;
}

export function bookingStatusColor(status: BookingStatus): string {
  if (status === 'PENDIENTE' || status === 'ACEPTADA') return '#895A08';
  if (status === 'CANCELADA' || status === 'RECHAZADA') return '#A74444';
  if (status === 'COMPLETADA') return '#52695C';
  return '#087D56';
}

export function mergeBookings(current: Booking[], incoming: Booking[]): Booking[] {
  const seen = new Set(current.map((booking) => booking.id));
  return [...current, ...incoming.filter((booking) => {
    if (seen.has(booking.id)) return false;
    seen.add(booking.id);
    return true;
  })];
}
