import type { AuthSession } from '../api/auth';

const SESSION_KEY = 'servimatch.auth.session';

export async function readStoredSession(): Promise<AuthSession | null> {
  const value = globalThis.sessionStorage?.getItem(SESSION_KEY);
  if (!value) return null;
  try {
    return JSON.parse(value) as AuthSession;
  } catch {
    globalThis.sessionStorage?.removeItem(SESSION_KEY);
    return null;
  }
}

export async function saveSession(session: AuthSession): Promise<void> {
  globalThis.sessionStorage?.setItem(SESSION_KEY, JSON.stringify(session));
}

export async function clearStoredSession(): Promise<void> {
  globalThis.sessionStorage?.removeItem(SESSION_KEY);
}
