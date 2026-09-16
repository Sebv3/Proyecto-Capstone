import axios from 'axios';

export type User = {
  id: string;
  nombre: string;
  email: string;
  rol: 'CLIENTE' | 'TRABAJADOR' | 'ADMIN';
  activo: boolean;
};

const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, ''),
  timeout: 15000,
});

export type RegisterInput = {
  nombre: string; email: string; rut: string; password: string;
  rol: 'CLIENTE' | 'TRABAJADOR';
};
export type RegisterResult = { user_id: string; email_confirmation_required: boolean };

export async function register(input: RegisterInput): Promise<RegisterResult> {
  if (!api.defaults.baseURL) throw new Error('No se ha configurado la conexión con el servicio.');
  const { nombre, email, rut, password, rol } = input;
  const { data } = await api.post<RegisterResult>('/auth/register', { nombre, email, rut, password, rol });
  if (!data.user_id || typeof data.email_confirmation_required !== 'boolean') {
    throw new Error('No se pudo comprobar el registro. Intenta iniciar sesión antes de repetirlo.');
  }
  return { user_id: data.user_id, email_confirmation_required: data.email_confirmation_required };
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

export async function login(email: string, password: string): Promise<User> {
  if (!api.defaults.baseURL) throw new Error('No se ha configurado la conexión con el servicio.');
  const { data: session } = await api.post<{ access_token: string }>('/auth/login', { email, password });
  if (!session.access_token) throw new Error('No se pudo iniciar la sesión. Inténtalo nuevamente.');
  const { data } = await api.get<{ user: User }>('/auth/me', {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!data.user?.id || !data.user.activo) throw new Error('No se pudo acceder a tu perfil.');
  return data.user;
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
