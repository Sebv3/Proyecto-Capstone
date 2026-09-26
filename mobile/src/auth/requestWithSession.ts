import axios from 'axios';
import type { AuthSession } from '../api/auth';

const REFRESH_MARGIN_MS = 30_000;

export async function requestWithSession<T>(
  session: AuthSession | null,
  renew: () => Promise<AuthSession>,
  request: (token: string) => Promise<T>,
): Promise<T> {
  if (!session) throw new Error('Inicia sesión para continuar.');
  const ready = session.expires_at <= Date.now() + REFRESH_MARGIN_MS
    ? await renew() : session;
  try {
    return await request(ready.access_token);
  } catch (error) {
    if (!axios.isAxiosError(error) || error.response?.status !== 401) throw error;
    const refreshed = await renew();
    return request(refreshed.access_token);
  }
}
