import axios from 'axios';

export type Availability = { id: string; servicio_id: string; inicio_en: string; fin_en: string };
export type Booking = {
  id: string; servicio_id: string; cliente_id: string; trabajador_id: string;
  servicio_nombre: string; precio_base: number; duracion_estimada_minutos: number;
  modalidad: 'DOMICILIO' | 'TALLER'; inicio_en: string; ubicacion_servicio: string;
  estado: 'PENDIENTE' | 'ACEPTADA' | 'PAGADA' | 'EN_CAMINO' | 'EN_CURSO' | 'LISTO' | 'COMPLETADA' | 'RECHAZADA' | 'CANCELADA';
  motivo_cancelacion?: string | null;
  creado_en?: string;
  actualizado_en?: string;
};
export type BookingStatus = Booking['estado'];
export type BookingAction = 'aceptar' | 'rechazar' | 'en-camino' | 'iniciar' | 'listo';
export type BookingInput = { servicio_id: string; inicio_en: string; direccion_servicio?: string };
const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, ''), timeout: 15000,
});
function requireConnection() {
  if (!api.defaults.baseURL) throw new Error('No se ha configurado la conexión con el servicio.');
}
export type BookingFilters = { estado?: BookingStatus; desde?: string; hasta?: string; agenda?: boolean; offset?: number };
export const BOOKING_PAGE_SIZE = 20;
export async function getBookings(token: string, filters: BookingFilters = {}, signal?: AbortSignal): Promise<Booking[]> {
  requireConnection();
  const { data } = await api.get<Booking[]>('/solicitudes', {
    headers: { Authorization: `Bearer ${token}` }, signal,
    params: { estado: filters.estado, desde: filters.desde, hasta: filters.hasta, agenda: filters.agenda,
      limit: BOOKING_PAGE_SIZE, offset: filters.offset ?? 0 },
  });
  return data;
}
export async function getBooking(token: string, bookingId: string, signal?: AbortSignal): Promise<Booking> {
  requireConnection();
  const { data } = await api.get<Booking>(`/solicitudes/${encodeURIComponent(bookingId)}`, {
    headers: { Authorization: `Bearer ${token}` }, signal,
  });
  return data;
}
export async function changeBooking(token: string, bookingId: string, action: BookingAction): Promise<Booking> {
  requireConnection();
  if (!['aceptar', 'rechazar', 'en-camino', 'iniciar', 'listo'].includes(action)) throw new Error('Acción no permitida.');
  const { data } = await api.post<Booking>(`/solicitudes/${encodeURIComponent(bookingId)}/${action}`, undefined, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}
export async function cancelBooking(token: string, bookingId: string, reason: string): Promise<Booking> {
  requireConnection();
  const { data } = await api.post<Booking>(`/solicitudes/${encodeURIComponent(bookingId)}/cancelar`, { motivo: reason.trim() }, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}
export type ConfirmationCode = { codigo: string; expira_en: string };
export async function getConfirmationCode(token: string, bookingId: string): Promise<ConfirmationCode> {
  requireConnection();
  const { data } = await api.post<ConfirmationCode>(`/solicitudes/${encodeURIComponent(bookingId)}/codigo-confirmacion`, undefined, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}
export async function completeBooking(token: string, bookingId: string, code: string): Promise<Booking> {
  requireConnection();
  const { data } = await api.post<Booking>(`/solicitudes/${encodeURIComponent(bookingId)}/completar`, { codigo: code.trim() }, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}
export function bookingOperationError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'No recibimos confirmación. Actualiza la solicitud para comprobar su estado antes de repetir la acción.';
    switch (error.response.status) {
      case 401: return 'Tu sesión venció. Inicia sesión para continuar.';
      case 403: return 'No tienes permiso para realizar esta acción en la solicitud.';
      case 404: return 'Solicitud no encontrada o fuera de tu cuenta.';
      case 409: return error.response.data?.detail === 'Código incorrecto, vencido o bloqueado; consulta al trabajador'
        ? 'El código es incorrecto, venció o está bloqueado. Consulta al trabajador.'
        : 'El estado o el horario cambió y esta acción ya no está disponible. Actualiza la solicitud.';
      case 422: return 'Revisa los datos, el motivo o el código ingresado.';
      case 503: return 'Las solicitudes no están disponibles todavía. Inténtalo más tarde.';
      default: return 'No pudimos consultar o actualizar la solicitud. Inténtalo nuevamente.';
    }
  }
  return 'No pudimos consultar o actualizar la solicitud. Inténtalo nuevamente.';
}
export async function getAvailability(serviceId: string, signal?: AbortSignal): Promise<Availability[]> {
  requireConnection();
  const { data } = await api.get<Availability[]>(`/servicios/${encodeURIComponent(serviceId)}/disponibilidad`, { signal });
  return data;
}
export async function createBooking(token: string, values: BookingInput): Promise<Booking> {
  requireConnection();
  const { data } = await api.post<Booking>('/solicitudes', {
    servicio_id: values.servicio_id, inicio_en: values.inicio_en,
    ...(values.direccion_servicio === undefined ? {} : { direccion_servicio: values.direccion_servicio }),
  }, { headers: { Authorization: `Bearer ${token}` } });
  return data;
}
export type AvailabilityInput = { inicio_en: string; fin_en: string };
export async function createAvailability(token: string, serviceId: string, values: AvailabilityInput): Promise<Availability> {
  requireConnection();
  const { data } = await api.post<Availability>(`/trabajador/servicios/${encodeURIComponent(serviceId)}/disponibilidad`, {
    inicio_en: values.inicio_en, fin_en: values.fin_en,
  }, { headers: { Authorization: `Bearer ${token}` } });
  return data;
}
export async function deleteAvailability(token: string, serviceId: string, blockId: string): Promise<Availability> {
  requireConnection();
  const { data } = await api.delete<Availability>(`/trabajador/servicios/${encodeURIComponent(serviceId)}/disponibilidad/${encodeURIComponent(blockId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}
export function availabilityErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'No recibimos confirmación. Actualiza los bloques para comprobar el resultado antes de repetir la operación.';
    switch (error.response.status) {
      case 401: return 'Tu sesión venció. Inicia sesión para continuar.';
      case 403: return 'Solo puedes gestionar la disponibilidad de tus propios servicios con una cuenta de trabajador activa.';
      case 404: return 'El servicio o el bloque ya no está disponible. Actualiza la agenda.';
      case 409: return 'No se puede eliminar un bloque que coincide con una reserva confirmada. Actualiza la agenda.';
      case 422: return 'Revisa la fecha y las horas del bloque.';
      case 503: return 'La agenda no está disponible todavía. Inténtalo más tarde.';
      default: return 'No pudimos consultar o guardar la disponibilidad. Inténtalo nuevamente.';
    }
  }
  return 'No pudimos cargar la disponibilidad. Inténtalo nuevamente.';
}
export function bookingErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'No recibimos confirmación del servidor. Revisa tu conexión; si reintentas el mismo horario, el sistema evita solicitudes duplicadas.';
    switch (error.response.status) {
      case 401: return 'Tu sesión venció. Inicia sesión para continuar.';
      case 403: return 'Necesitas una cuenta de cliente activa para agendar.';
      case 404: return 'El servicio ya no está disponible.';
      case 409: return 'El horario está ocupado o la solicitud ya fue enviada. Actualiza los horarios antes de volver a intentar.';
      case 422: return 'Revisa la fecha, hora y dirección de la solicitud.';
      case 503: return 'La agenda no está disponible todavía. Inténtalo más tarde.';
      default: return 'No pudimos consultar o guardar la solicitud. Inténtalo nuevamente.';
    }
  }
  return 'No pudimos cargar la agenda. Inténtalo nuevamente.';
}
