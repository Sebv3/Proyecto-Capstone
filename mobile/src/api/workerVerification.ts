import axios from 'axios';
import { Platform } from 'react-native';
import type { ImagePickerAsset } from 'expo-image-picker';

export type WorkerProfile = {
  usuario_id: string;
  direccion_base: string;
  comuna: { id: string; nombre: string } | null;
  creado_en: string;
  actualizado_en: string;
};

export type WorkerVerification = {
  trabajador_id: string;
  estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';
  motivo_rechazo: string | null;
  creado_en: string;
  actualizado_en: string;
};

export type VerificationImages = {
  carnet_frontal: ImagePickerAsset;
  carnet_reverso: ImagePickerAsset;
  selfie: ImagePickerAsset;
};

const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, ''),
  timeout: 60000,
});

function bearer(token: string) {
  if (!api.defaults.baseURL) throw new Error('No se ha configurado la conexión con el servicio.');
  return { headers: { Authorization: `Bearer ${token}` } };
}

export async function getWorkerProfile(token: string): Promise<WorkerProfile> {
  const { data } = await api.get<WorkerProfile>('/perfiles/trabajador', bearer(token));
  return data;
}

export async function saveWorkerAddress(
  token: string, input: { direccion_base: string; comuna_id: string }, exists: boolean,
): Promise<WorkerProfile> {
  const url = '/perfiles/trabajador';
  const { data } = exists
    ? await api.patch<WorkerProfile>(url, input, bearer(token))
    : await api.post<WorkerProfile>(url, input, bearer(token));
  return data;
}

export async function getWorkerVerification(token: string): Promise<WorkerVerification> {
  const { data } = await api.get<WorkerVerification>('/verificaciones/trabajador', bearer(token));
  return data;
}

export async function submitWorkerVerification(
  token: string, images: VerificationImages,
): Promise<WorkerVerification> {
  const form = new FormData();
  for (const [field, asset] of Object.entries(images)) {
    const mime = asset.mimeType ?? 'image/jpeg';
    if (Platform.OS === 'web' && asset.file) form.append(field, asset.file);
    else form.append(field, {
      uri: asset.uri,
      type: mime,
      name: asset.fileName ?? `${field}.${mime.split('/')[1]}`,
    } as unknown as Blob);
  }
  const { data } = await api.post<WorkerVerification>(
    '/verificaciones/trabajador', form, bearer(token),
  );
  return data;
}

export function missingWorkerResource(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 404;
}

export function workerErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'No pudimos conectar con el servicio.';
    if (error.response.status === 401) return 'Tu sesión venció. Vuelve a iniciar sesión.';
    if (error.response.status === 409) return 'El estado cambió. Actualiza el perfil e inténtalo nuevamente.';
    if (error.response.status === 422) return 'Revisa la dirección y que las tres imágenes sean válidas (máximo 5 MB cada una).';
    return 'No pudimos completar la operación. Inténtalo nuevamente.';
  }
  return error instanceof Error ? error.message : 'No pudimos completar la operación.';
}
