import axios from 'axios';

export type ClientProfile = {
  usuario_id: string;
  email: string;
  nombre: string;
  rut: string;
  telefono: string | null;
  avatar_url: string | null;
  direccion: string;
  comuna: { id: string; nombre: string };
  activo: boolean;
  creado_en: string;
  actualizado_en: string;
};

const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, ''),
  timeout: 15000,
});

export async function getClientProfile(accessToken: string): Promise<ClientProfile> {
  if (!api.defaults.baseURL) throw new Error('No se ha configurado la conexión con el servicio.');
  const { data } = await api.get<ClientProfile>('/perfiles/cliente', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!data.usuario_id || !data.comuna?.id || !data.direccion) {
    throw new Error('El servicio devolvió un perfil incompleto.');
  }
  return data;
}

export function clientProfileErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'No pudimos conectar con el servicio.';
    if (error.response.status === 404) return 'Tu perfil cliente todavía no está completo.';
    if (error.response.status === 401) return 'Tu sesión venció. Vuelve a iniciar sesión.';
    return 'No pudimos cargar tu perfil. Inténtalo nuevamente.';
  }
  return error instanceof Error ? error.message : 'No pudimos cargar tu perfil.';
}
