import axios from 'axios';

export type LocationService = {
  id: string; nombre: string; precio_base: number; categoria_id: string; categoria_nombre: string;
};
export type PublicLocation = {
  id: string; trabajador_id: string; nombre: string; direccion_publica: string;
  latitud: number; longitud: number; trabajador_nombre: string; servicios: LocationService[];
};

const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, ''), timeout: 15000,
});

function requireApi() {
  if (!api.defaults.baseURL) throw new Error('No se ha configurado la conexión con el servicio.');
}

export async function getLocations(signal?: AbortSignal): Promise<PublicLocation[]> {
  requireApi();
  const { data } = await api.get<PublicLocation[]>('/locales', { signal });
  return data;
}

export async function getLocation(id: string, signal?: AbortSignal): Promise<PublicLocation> {
  requireApi();
  const { data } = await api.get<PublicLocation>(`/locales/${encodeURIComponent(id)}`, { signal });
  return data;
}

export function locationErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'No pudimos conectar con los locales.';
    if (error.response.status === 404) return 'Este local ya no está disponible.';
    if (error.response.status === 503) return 'El mapa de locales aún no está habilitado.';
    return 'No pudimos cargar los locales. Inténtalo nuevamente.';
  }
  return error instanceof Error ? error.message : 'No pudimos cargar los locales.';
}
