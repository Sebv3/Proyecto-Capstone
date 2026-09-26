import axios from 'axios';

export type User = {
  id: string;
  nombre: string;
  email: string;
  rol: 'CLIENTE' | 'TRABAJADOR' | 'ADMIN';
  activo: boolean;
};

export type AuthSession = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  expires_at: number;
};

export type AuthenticatedUser = {
  session: AuthSession;
  user: User;
};

const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, ''),
  timeout: 15000,
});

export type RegisterInput = {
  nombre: string; email: string; rut: string; password: string;
  rol: 'CLIENTE' | 'TRABAJADOR';
  direccion?: string;
  comuna_id?: string;
};
export type RegisterResult = {
  user_id: string;
  email_confirmation_required: boolean;
  session: AuthSession | null;
};
export type Commune = { id: string; nombre: string };

export async function getCommunes(): Promise<Commune[]> {
  if (!api.defaults.baseURL) throw new Error('No se ha configurado la conexión con el servicio.');
  const { data } = await api.get<Commune[]>('/comunas');
  if (!Array.isArray(data) || data.some((commune) => !commune.id || !commune.nombre)) {
    throw new Error('No se pudo cargar la lista de comunas.');
  }
  return data;
}

export async function register(input: RegisterInput): Promise<RegisterResult> {
  if (!api.defaults.baseURL) throw new Error('No se ha configurado la conexión con el servicio.');
  const { nombre, email, rut, password, rol, direccion, comuna_id } = input;
  const profile = { direccion, comuna_id };
  const { data } = await api.post<{
    user_id: string; email_confirmation_required: boolean;
    session: Omit<AuthSession, 'expires_at'> | null;
  }>('/auth/register', {
    nombre, email, rut, password, rol, ...profile,
  });
  if (!data.user_id || typeof data.email_confirmation_required !== 'boolean') {
    throw new Error('No se pudo comprobar el registro. Intenta iniciar sesión antes de repetirlo.');
  }
  return {
    user_id: data.user_id,
    email_confirmation_required: data.email_confirmation_required,
    session: data.session ? parseSession(data.session) : null,
  };
}

export function registerErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'No pudimos comprobar el registro. Revisa tu conexión y tu correo antes de reintentar.';
    switch (error.response.status) {
      case 400: case 409: case 422:
        return 'No se pudo registrar la cuenta. Revisa tus datos; si ya tienes cuenta, inicia sesión.';
      case 429: return 'Demasiados intentos. Espera unos minutos antes de volver a intentar.';
      default: return 'El servicio no pudo completar el registro. Inténtalo más tarde.';
    }
  }
  return error instanceof Error ? error.message : 'No se pudo registrar la cuenta.';
}

function parseSession(data: Omit<AuthSession, 'expires_at'>): AuthSession {
  if (!data.access_token || !data.refresh_token || !data.token_type || data.expires_in <= 0) {
    throw new Error('Supabase devolvió una sesión incompleta.');
  }
  return { ...data, expires_at: Date.now() + data.expires_in * 1000 };
}

export async function getCurrentUser(accessToken: string): Promise<User> {
  const { data } = await api.get<{ user: User }>('/auth/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!data.user?.id || !data.user.activo) throw new Error('No se pudo acceder a tu perfil.');
  return data.user;
}

export async function login(email: string, password: string): Promise<AuthenticatedUser> {
  if (!api.defaults.baseURL) throw new Error('No se ha configurado la conexión con el servicio.');
  const { data } = await api.post<Omit<AuthSession, 'expires_at'>>('/auth/login', { email, password });
  const session = parseSession(data);
  return { session, user: await getCurrentUser(session.access_token) };
}

export async function refreshSession(refreshToken: string): Promise<AuthSession> {
  if (!api.defaults.baseURL) throw new Error('No se ha configurado la conexión con el servicio.');
  const { data } = await api.post<Omit<AuthSession, 'expires_at'>>('/auth/refresh', {
    refresh_token: refreshToken,
  });
  return parseSession(data);
}

export function loginErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'No pudimos conectar con el servicio. Revisa tu conexión e inténtalo nuevamente.';
    switch (error.response.status) {
      case 401: return 'El correo o la contraseña son incorrectos, o tu sesión ya no es válida.';
      case 403:
        return error.response.data?.detail === 'Cuenta inactiva'
          ? 'Tu cuenta está inactiva. Contacta al administrador.'
          : 'Confirma tu correo antes de iniciar sesión. Revisa también la carpeta de spam.';
      case 429: return 'Demasiados intentos. Espera unos minutos antes de volver a ingresar.';
      case 422: return 'Revisa el correo y la contraseña ingresados.';
      default: return 'No se pudo iniciar sesión. Inténtalo más tarde.';
    }
  }
  return error instanceof Error ? error.message : 'No se pudo iniciar sesión.';
}

export function isUnauthorized(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 401;
}
