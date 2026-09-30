import axios from 'axios';
import type { ImagePickerAsset } from 'expo-image-picker';

export type WorkerRoleRequest = {
  id: string;
  usuario_id: string;
  estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';
  motivo_rechazo: string | null;
  creado_en: string;
  actualizado_en: string;
};

const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, ''),
  timeout: 60000,
});

function bearer(token: string) {
  if (!api.defaults.baseURL) throw new Error('No se ha configurado la conexión con el servicio.');
  return { headers: { Authorization: `Bearer ${token}` } };
}

export async function getWorkerRoleRequest(token: string): Promise<WorkerRoleRequest> {
  const { data } = await api.get<WorkerRoleRequest>('/solicitudes/rol-trabajador', bearer(token));
  return data;
}

export type WorkerRoleRequestImages = {
  carnet_frontal: ImagePickerAsset;
  carnet_reverso: ImagePickerAsset;
  selfie: ImagePickerAsset;
};

export async function createWorkerRoleRequest(
  token: string, images: WorkerRoleRequestImages,
): Promise<WorkerRoleRequest> {
  const form = new FormData();
  for (const [field, asset] of Object.entries(images)) {
    const mime = asset.mimeType ?? 'image/jpeg';
    if (asset.file) form.append(field, asset.file);
    else form.append(field, {
      uri: asset.uri,
      type: mime,
      name: asset.fileName ?? `${field}.${mime.split('/')[1]}`,
    } as unknown as Blob);
  }
  const { data } = await api.post<WorkerRoleRequest>(
    '/solicitudes/rol-trabajador', form, bearer(token),
  );
  return data;
}

export function isMissingWorkerRoleRequest(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 404;
}

export function workerRoleRequestErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'No pudimos conectar con el servicio.';
    if (error.response.status === 401) return 'Tu sesión venció. Vuelve a iniciar sesión.';
    if (error.response.status === 409) return 'Ya tienes una solicitud pendiente.';
    if (error.response.status === 403) return 'Tu cuenta no puede realizar esta solicitud.';
    return 'No pudimos procesar la solicitud. Inténtalo nuevamente.';
  }
  return error instanceof Error ? error.message : 'No pudimos procesar la solicitud.';
}
