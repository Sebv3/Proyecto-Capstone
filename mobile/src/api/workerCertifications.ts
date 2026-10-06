import axios from 'axios';
import type { DocumentPickerAsset } from 'expo-document-picker';

export type WorkerCertification = {
  id: string; trabajador_id: string; categoria_id: string; nombre: string;
  estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA'; motivo_rechazo: string | null;
  creado_en: string; actualizado_en: string;
};
const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, ''), timeout: 60000,
});
function bearer(token: string) {
  if (!api.defaults.baseURL) throw new Error('No se ha configurado la conexión con el servicio.');
  return { headers: { Authorization: `Bearer ${token}` } };
}
export async function getWorkerCertifications(token: string): Promise<WorkerCertification[]> {
  const { data } = await api.get<WorkerCertification[]>('/trabajador/certificaciones', bearer(token));
  return data;
}
export async function submitWorkerCertification(
  token: string, categoryId: string, name: string, asset: DocumentPickerAsset,
): Promise<WorkerCertification> {
  const form = new FormData();
  form.append('categoria_id', categoryId);
  form.append('nombre', name.trim());
  if (asset.file) form.append('documento', asset.file);
  else form.append('documento', { uri: asset.uri, type: asset.mimeType, name: asset.name } as unknown as Blob);
  const { data } = await api.post<WorkerCertification>('/trabajador/certificaciones', form, bearer(token));
  return data;
}
export function certificationErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'No pudimos conectar. Revisa tu conexión y vuelve a intentarlo.';
    if (error.response.status === 409) return 'Ya tienes una certificación pendiente o aprobada para esta categoría. Actualiza el estado.';
    if (error.response.status === 403) return 'Tu cuenta no puede realizar esta operación.';
    if (error.response.status === 422) return 'Revisa la categoría, el nombre y el documento (PDF o imagen, máximo 5 MB).';
    if (error.response.status === 503) return 'El módulo de certificaciones todavía no está disponible. Contacta al administrador.';
    return 'No pudimos procesar la certificación. Inténtalo nuevamente.';
  }
  return error instanceof Error ? error.message : 'No pudimos procesar la certificación.';
}
