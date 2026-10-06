import axios from 'axios';
import type { CatalogService } from './catalog';

export type LocatedService = CatalogService & { ubicacion_publica: string; latitud: number; longitud: number };
const api = axios.create({ baseURL: process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, ''), timeout: 15000 });
export async function getMapServices(signal?: AbortSignal): Promise<LocatedService[]> {
  if (!api.defaults.baseURL) throw new Error('No se ha configurado la conexión con el servicio.');
  const { data } = await api.get<LocatedService[]>('/mapa/servicios', { signal });
  return data;
}

export function serviceMapErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 503) return 'El mapa de servicios aún no está habilitado.';
    if (!error.response) return 'No pudimos conectar con el mapa de servicios.';
    return 'No pudimos cargar los servicios. Inténtalo nuevamente.';
  }
  return error instanceof Error ? error.message : 'No pudimos cargar los servicios.';
}
