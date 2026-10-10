import type { Availability, AvailabilityInput, BookingInput } from '../api/bookings';

type Offer = { id: string; modalidad: 'DOMICILIO' | 'TALLER'; duracion_estimada_minutos: number; ubicacion_publica: string | null };
export type BookingFields = { date: string; time: string; address: string };

// Construct local time and round-trip its components: reject overflow dates and DST gaps.
export function parseBookingTime(date: string, time: string): Date | null {
  if (!/^\d{2}-\d{2}-\d{4}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [day, month, year] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const result = new Date(year, month - 1, day, hour, minute);
  return result.getFullYear() === year && result.getMonth() === month - 1 && result.getDate() === day
    && result.getHours() === hour && result.getMinutes() === minute ? result : null;
}
export function localBookingFields(value: Date): Pick<BookingFields, 'date' | 'time'> {
  const pad = (n: number) => String(n).padStart(2, '0');
  return { date: `${pad(value.getDate())}-${pad(value.getMonth() + 1)}-${value.getFullYear()}`,
    time: `${pad(value.getHours())}:${pad(value.getMinutes())}` };
}
export function firstBookingStart(block: Availability, minutes: number, now = Date.now()): Date | null {
  const start = Math.ceil(Math.max(Date.parse(block.inicio_en), now + 1) / 60000) * 60000;
  return Number.isFinite(start) && start + minutes * 60000 <= Date.parse(block.fin_en) ? new Date(start) : null;
}
export function buildBookingInput(offer: Offer, fields: BookingFields, blocks: Availability[], now = Date.now()): BookingInput {
  const start = parseBookingTime(fields.date.trim(), fields.time.trim());
  if (!start) throw new Error('Indica una fecha válida (DD-MM-AAAA) y una hora válida (HH:MM).');
  if (start.getTime() <= now) throw new Error('La fecha y hora deben ser futuras.');
  const end = start.getTime() + offer.duracion_estimada_minutos * 60000;
  if (!blocks.some((block) => block.servicio_id === offer.id
    && Date.parse(block.inicio_en) <= start.getTime() && Date.parse(block.fin_en) >= end)) {
    throw new Error('El servicio completo debe caber en uno de los bloques publicados por el trabajador.');
  }
  const address = fields.address.trim();
  if (offer.modalidad === 'DOMICILIO' && (address.length < 5 || address.length > 240)) {
    throw new Error('Indica tu dirección de atención, entre 5 y 240 caracteres.');
  }
  if (offer.modalidad === 'TALLER' && !offer.ubicacion_publica) throw new Error('El taller debe tener una dirección publicada antes de agendar.');
  return { servicio_id: offer.id, inicio_en: start.toISOString(),
    ...(offer.modalidad === 'DOMICILIO' ? { direccion_servicio: address } : {}) };
}
export function formatBookingDate(value: string): string {
  const fields = localBookingFields(new Date(value));
  return `${fields.date} · ${fields.time}`;
}
export function buildAvailabilityInput(date: string, startTime: string, endTime: string, durationMinutes: number, now = Date.now()): AvailabilityInput {
  const start = parseBookingTime(date.trim(), startTime.trim());
  const end = parseBookingTime(date.trim(), endTime.trim());
  if (!start || !end) throw new Error('Indica una fecha válida (DD-MM-AAAA) y horas válidas (HH:MM).');
  if (start.getTime() <= now) throw new Error('El bloque debe comenzar en una fecha y hora futuras.');
  if (end.getTime() <= start.getTime()) throw new Error('La hora de término debe ser posterior al inicio, en el mismo día.');
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0 || end.getTime() - start.getTime() < durationMinutes * 60000) {
    throw new Error(`El bloque debe durar al menos ${durationMinutes} minutos para realizar este servicio.`);
  }
  return { inicio_en: start.toISOString(), fin_en: end.toISOString() };
}
export function getBookingTimes(date: string, blocks: Availability[], minutes: number, now = Date.now()): string[] {
  const day = parseBookingTime(date, '12:00');
  if (!day || !Number.isFinite(minutes) || minutes <= 0) return [];
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
  const result = new Set<string>();
  for (const block of blocks) {
    let start = Math.ceil(Math.max(Date.parse(block.inicio_en), dayStart) / 60000) * 60000;
    if (start <= now) start += Math.ceil((now + 1 - start) / (30 * 60000)) * 30 * 60000;
    const last = Math.min(Date.parse(block.fin_en) - minutes * 60000, dayEnd - 1);
    for (; start <= last; start += 30 * 60000) {
      const value = localBookingFields(new Date(start));
      // Only expose instants the local-time form can represent unambiguously.
      if (value.date === date && parseBookingTime(date, value.time)?.getTime() === start) result.add(value.time);
    }
  }
  return [...result].sort();
}
export function bookingDayRange(date: string): { desde: string; hasta: string } | null {
  const day = parseBookingTime(date, '12:00');
  if (!day) return null;
  return { desde: new Date(day.getFullYear(), day.getMonth(), day.getDate()).toISOString(),
    hasta: new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).toISOString() };
}
