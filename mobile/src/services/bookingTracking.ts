import type { Booking, BookingAction, BookingStatus } from '../api/bookings';

export type BookingRole = 'CLIENTE' | 'TRABAJADOR';
export const bookingStatusLabels: Record<BookingStatus, string> = {
  PENDIENTE: 'Pendiente', ACEPTADA: 'Aceptada · pendiente de pago', PAGADA: 'Pagada', EN_CAMINO: 'En camino',
  EN_CURSO: 'En curso', LISTO: 'Listo para retirar', COMPLETADA: 'Completada', RECHAZADA: 'Rechazada', CANCELADA: 'Cancelada',
};
export function bookingSteps(modality: Booking['modalidad']): BookingStatus[] {
  return modality === 'DOMICILIO' ? ['PENDIENTE', 'ACEPTADA', 'PAGADA', 'EN_CAMINO', 'EN_CURSO', 'COMPLETADA']
    : ['PENDIENTE', 'ACEPTADA', 'PAGADA', 'EN_CURSO', 'LISTO', 'COMPLETADA'];
}
export function workerActions(booking: Booking, role: BookingRole): { action: BookingAction; label: string }[] {
  if (role !== 'TRABAJADOR') return [];
  if (booking.estado === 'PENDIENTE') return [{ action: 'aceptar', label: 'Aceptar solicitud' }, { action: 'rechazar', label: 'Rechazar solicitud' }];
  if (booking.modalidad === 'DOMICILIO' && booking.estado === 'PAGADA') return [{ action: 'en-camino', label: 'Estoy en camino' }];
  if ((booking.modalidad === 'DOMICILIO' && booking.estado === 'EN_CAMINO')
    || (booking.modalidad === 'TALLER' && booking.estado === 'PAGADA')) return [{ action: 'iniciar', label: 'Iniciar servicio' }];
  if (booking.modalidad === 'TALLER' && booking.estado === 'EN_CURSO') return [{ action: 'listo', label: 'Listo para retirar' }];
  return [];
}
export function canCancelBooking(booking: Booking): boolean {
  return booking.estado === 'PENDIENTE' || booking.estado === 'ACEPTADA';
}
export function canConfirmBooking(booking: Booking): boolean {
  return (booking.modalidad === 'DOMICILIO' && booking.estado === 'EN_CURSO') || (booking.modalidad === 'TALLER' && booking.estado === 'LISTO');
}
export function isTerminalBooking(booking: Booking): boolean {
  return ['COMPLETADA', 'CANCELADA', 'RECHAZADA'].includes(booking.estado);
}
