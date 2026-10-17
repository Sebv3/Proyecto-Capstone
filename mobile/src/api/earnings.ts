import axios from 'axios';

export type EarningsDay = { fecha: string; monto: number };
export type EarningsItem = {
  solicitud_id: string; servicio_nombre: string; estado: string;
  monto: number; fecha: string; completada: boolean;
};
export type WorkerEarnings = {
  mes: string; moneda: 'CLP'; simulado: true;
  total_completado: number; cantidad_completada: number;
  total_en_curso: number; cantidad_en_curso: number;
  dias: EarningsDay[]; items: EarningsItem[]; limit: number; offset: number; has_more: boolean;
};
const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, ''), timeout: 15000,
});
export async function getWorkerEarnings(token: string, month: string, offset = 0, signal?: AbortSignal): Promise<WorkerEarnings> {
  if (!/^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.test(month) || !Number.isSafeInteger(offset) || offset < 0) {
    throw new Error('Mes o página inválidos.');
  }
  if (!api.defaults.baseURL) throw new Error('No se ha configurado la conexión con el servicio.');
  const { data } = await api.get<WorkerEarnings>('/trabajadores/me/ganancias', {
    headers: { Authorization: `Bearer ${token}` }, params: { mes: month, limit: 20, offset }, signal,
  });
  return data;
}
export function earningsError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 401) return 'Tu sesión venció. Inicia sesión nuevamente.';
    if (error.response?.status === 403) return 'Solo los trabajadores pueden consultar sus ganancias.';
    if (error.response?.status === 503) return 'Las ganancias aún no están habilitadas. Falta actualizar la base de datos.';
  }
  return 'No pudimos cargar tus ganancias. Inténtalo nuevamente.';
}
