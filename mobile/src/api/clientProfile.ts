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

export type ClientProfileCreate = { direccion: string; comuna_id: string };
export type ClientProfileUpdate = {
  nombre: string;
  telefono: string | null;
  direccion: string;
  comuna_id: string;
};

const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, ''),
  timeout: 15000,
});

function requireApi() {
  if (!api.defaults.baseURL) throw new Error('No se ha configurado la conexión con el servicio.');
}

function checkProfile(data: ClientProfile): ClientProfile {
  if (!data.usuario_id || !data.comuna?.id || !data.direccion) {
    throw new Error('El servicio devolvió un perfil incompleto.');
  }
  return data;
}

function bearer(accessToken: string) {
  return { headers: { Authorization: `Bearer ${accessToken}` } };
}

export async function getClientProfile(accessToken: string): Promise<ClientProfile> {
  requireApi();
  const { data } = await api.get<ClientProfile>('/perfiles/cliente', bearer(accessToken));
  return checkProfile(data);
}

export async function createClientProfile(
  accessToken: string, input: ClientProfileCreate,
): Promise<ClientProfile> {
  requireApi();
  const { data } = await api.post<ClientProfile>('/perfiles/cliente', input, bearer(accessToken));
  return checkProfile(data);
}

export async function updateClientProfile(
  accessToken: string, input: ClientProfileUpdate,
): Promise<ClientProfile> {
  requireApi();
  const { data } = await api.patch<ClientProfile>('/perfiles/cliente', input, bearer(accessToken));
  return checkProfile(data);
}

export async function deactivateClientAccount(accessToken: string): Promise<void> {
  requireApi();
  await api.delete('/perfiles/cliente', bearer(accessToken));
}

export function isMissingClientProfile(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 404;
}

export function clientProfileErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'No pudimos conectar con el servicio.';
    if (error.response.status === 404) return 'No encontramos tu perfil cliente. Completa tus datos para continuar.';
    if (error.response.status === 401) return 'Tu sesión venció. Vuelve a iniciar sesión.';
    if (error.response.status === 409) return 'El perfil ya existe. Vuelve a cargar la pantalla.';
    if (error.response.status === 422) return 'Revisa los datos ingresados y la comuna seleccionada.';
    return 'No pudimos guardar tu perfil. Inténtalo nuevamente.';
  }
  return error instanceof Error ? error.message : 'No pudimos guardar tu perfil.';
}
