import { createContext, PropsWithChildren, useContext, useEffect, useState } from 'react';
import {
  AuthSession,
  getCurrentUser,
  isUnauthorized,
  login,
  refreshSession,
  User,
} from '../api/auth';
import { clearStoredSession, readStoredSession, saveSession } from './sessionStorage';

type AuthState = {
  user: User | null;
  accessToken: string | null;
  isRestoringSession: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};
const AuthContext = createContext<AuthState | undefined>(undefined);

const REFRESH_MARGIN_MS = 30_000;

async function restoreSession(stored: AuthSession): Promise<{ session: AuthSession; user: User }> {
  let session = stored;
  let refreshed = false;

  if (session.expires_at <= Date.now() + REFRESH_MARGIN_MS) {
    session = await refreshSession(session.refresh_token);
    refreshed = true;
  }

  try {
    const user = await getCurrentUser(session.access_token);
    if (refreshed) await saveSession(session);
    return { session, user };
  } catch (error) {
    if (refreshed || !isUnauthorized(error)) throw error;
    session = await refreshSession(session.refresh_token);
    const user = await getCurrentUser(session.access_token);
    await saveSession(session);
    return { session, user };
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isRestoringSession, setIsRestoringSession] = useState(true);

  useEffect(() => {
    let active = true;
    async function restore() {
      try {
        const stored = await readStoredSession();
        if (!stored) return;
        const restored = await restoreSession(stored);
        if (active) {
          setUser(restored.user);
          setAccessToken(restored.session.access_token);
        }
      } catch {
        await clearStoredSession();
      } finally {
        if (active) setIsRestoringSession(false);
      }
    }
    void restore();
    return () => { active = false; };
  }, []);

  async function signIn(email: string, password: string) {
    const authenticated = await login(email, password);
    await saveSession(authenticated.session);
    setUser(authenticated.user);
    setAccessToken(authenticated.session.access_token);
  }

  async function signOut() {
    await clearStoredSession();
    setUser(null);
    setAccessToken(null);
  }

  return (
    <AuthContext.Provider value={{ user, accessToken, isRestoringSession, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('AuthProvider es obligatorio');
  return context;
}
