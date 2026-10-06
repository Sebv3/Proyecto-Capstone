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
  ubicacion_publica: string | null;
  latitud: number | null;
  longitud: number | null;
  radio_cobertura_km: number | null;
};

export type WorkerServiceCreate = Pick<WorkerService,
  'categoria_id' | 'nombre' | 'descripcion' | 'precio_base' | 'duracion_estimada_minutos' | 'modalidad'
> & { ubicacion_publica: string; latitud: number; longitud: number; radio_cobertura_km: number | null };

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

export async function createWorkerService(
  accessToken: string, values: WorkerServiceCreate,
): Promise<WorkerService> {
  if (!api.defaults.baseURL) throw new Error('No se ha configurado la conexión con el servicio.');
  const { data } = await api.post<WorkerService>('/trabajador/servicios', {
    categoria_id: values.categoria_id,
    nombre: values.nombre,
    descripcion: values.descripcion,
    precio_base: values.precio_base,
    duracion_estimada_minutos: values.duracion_estimada_minutos,
    modalidad: values.modalidad,
    ubicacion_publica: values.ubicacion_publica,
    latitud: values.latitud,
    longitud: values.longitud,
    radio_cobertura_km: values.radio_cobertura_km,
  }, { headers: { Authorization: `Bearer ${accessToken}` } });
  return data;
}

export function workerServicesErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'No pudimos conectar con el servicio. Revisa tu conexión e inténtalo nuevamente.';
    const status = error.response.status;
    if (status === 401) return 'Tu sesión venció. Inicia sesión para continuar.';
    if (status === 403) {
      if (error.response.data?.detail === 'La categoría requiere una certificación aprobada') {
        return 'Necesitas una certificación aprobada para publicar en esta categoría.';
      }
      return 'Tu cuenta debe estar activa y tu identidad aprobada para publicar servicios.';
    }
    if (status === 409) return 'Ya tienes cinco servicios activos. Desactiva uno antes de publicar otro.';
    if (status === 422) return 'Revisa los campos y comprueba que la categoría siga disponible.';
    if (status === 429) return 'Demasiados intentos. Espera un momento antes de volver a publicar.';
    if (status >= 500) return 'El servicio no está disponible. Inténtalo más tarde.';
    return 'No pudimos guardar o consultar el servicio. Inténtalo nuevamente.';
  }
  return error instanceof Error ? error.message : 'No pudimos cargar tus servicios.';
}
