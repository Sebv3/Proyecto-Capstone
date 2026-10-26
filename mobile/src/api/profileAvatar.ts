import axios from 'axios';
import type { ImagePickerAsset } from 'expo-image-picker';

export type AvatarResult = { avatar_url: string | null };
const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, ''), timeout: 60000,
});

function bearer(token: string) {
  if (!api.defaults.baseURL) throw new Error('No se ha configurado la conexión con el servicio.');
  return { headers: { Authorization: `Bearer ${token}` } };
}

export function validateAvatar(asset: ImagePickerAsset): void {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(asset.mimeType ?? '')) {
    throw new Error('Selecciona una foto JPEG, PNG o WebP.');
  }
  const size = asset.file?.size ?? asset.fileSize;
  if (size !== undefined && (size <= 0 || size > 5 * 1024 * 1024)) {
    throw new Error('La foto debe pesar como máximo 5 MB y no estar vacía.');
  }
}

export async function uploadProfileAvatar(token: string, asset: ImagePickerAsset): Promise<AvatarResult> {
  validateAvatar(asset);
  const form = new FormData();
  if (asset.file) form.append('foto', asset.file);
  else form.append('foto', {
    uri: asset.uri, type: asset.mimeType, name: `perfil.${asset.mimeType === 'image/jpeg' ? 'jpg' : asset.mimeType?.split('/')[1]}`,
  } as unknown as Blob);
  const { data } = await api.post<AvatarResult>('/perfil/foto', form, bearer(token));
  return data;
}

export async function removeProfileAvatar(token: string): Promise<AvatarResult> {
  const { data } = await api.delete<AvatarResult>('/perfil/foto', bearer(token));
  return data;
}

export function avatarError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'No recibimos confirmación. Recarga tu perfil antes de volver a intentar.';
    if (error.response.status === 401) return 'Tu sesión venció. Vuelve a iniciar sesión.';
    if (error.response.status === 422) return 'Usa una imagen válida JPEG, PNG o WebP de hasta 5 MB, 20 megapíxeles y 8192 píxeles por lado, sin animación.';
    if (error.response.status === 403) return 'No tienes permiso para actualizar la foto.';
    return 'No pudimos guardar la foto. Inténtalo nuevamente o revisa la configuración del almacenamiento.';
  }
  return error instanceof Error ? error.message : 'No pudimos cambiar la foto.';
}
