import axios from 'axios';

export type WorkerService = {
  id: string;
  trabajador_id: string;
  categoria_id: string;
  nombre: string;
  descripcion: string;
  precio_base: number;
  duracion_estimada_minutos: number;
  modalidad: 'DOMICILIO' | 'TALLER';
  activo: boolean;
  creado_en: string;
  actualizado_en: string;
};

const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, ''),
  timeout: 15000,
});

export async function getOwnServices(accessToken: string): Promise<WorkerService[]> {
  if (!api.defaults.baseURL) throw new Error('No se ha configurado la conexión con el servicio.');
  const { data } = await api.get<WorkerService[]>('/trabajador/servicios', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data;
}

export function workerServicesErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error) && !error.response) {
    return 'No pudimos conectar con el servicio.';
  }
  return error instanceof Error ? error.message : 'No pudimos cargar tus servicios.';
}
