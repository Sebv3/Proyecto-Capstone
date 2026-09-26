import { createContext, PropsWithChildren, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import axios from 'axios';
import {
  AuthSession,
  getCurrentUser,
  isUnauthorized,
  login,
  refreshSession,
  User,
} from '../api/auth';
import { clearStoredSession, readStoredSession, saveSession } from './sessionStorage';
import { requestWithSession } from './requestWithSession';

type AuthState = {
  user: User | null;
  isRestoringSession: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  startSession: (session: AuthSession) => Promise<void>;
  signOut: () => Promise<void>;
  withAccessToken: <T>(request: (token: string) => Promise<T>) => Promise<T>;
  updateUser: (changes: Pick<User, 'nombre'>) => void;
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
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const sessionRef = useRef<AuthSession | null>(null);
  const refreshRef = useRef<Promise<AuthSession> | null>(null);
  const authVersion = useRef(0);
  const storageWrites = useRef<Promise<void>>(Promise.resolve());

  function persist(next: AuthSession | null): Promise<void> {
    const write = storageWrites.current.then(() => next ? saveSession(next) : clearStoredSession());
    storageWrites.current = write.catch(() => {});
    return write;
  }

  useEffect(() => {
    let active = true;
    async function restore() {
      try {
        const stored = await readStoredSession();
        if (!stored) return;
        const restored = await restoreSession(stored);
        if (active) {
          setUser(restored.user);
          sessionRef.current = restored.session;
          setSession(restored.session);
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
    await persist(authenticated.session);
    authVersion.current += 1;
    sessionRef.current = authenticated.session;
    setSession(authenticated.session);
    setUser(authenticated.user);
  }

  async function startSession(next: AuthSession) {
    const authenticatedUser = await getCurrentUser(next.access_token);
    await persist(next);
    authVersion.current += 1;
    sessionRef.current = next;
    setSession(next);
    setUser(authenticatedUser);
  }

  async function signOut() {
    authVersion.current += 1;
    sessionRef.current = null;
    setSession(null);
    setUser(null);
    await persist(null);
  }

  async function renewSession(): Promise<AuthSession> {
    if (refreshRef.current) return refreshRef.current;
    const current = sessionRef.current;
    if (!current) throw new Error('Inicia sesión para continuar.');
    const version = authVersion.current;
    const pending = (async () => {
      const next = await refreshSession(current.refresh_token);
      const refreshedUser = await getCurrentUser(next.access_token);
      if (version !== authVersion.current) throw new Error('La sesión cambió.');
      await persist(next);
      if (version !== authVersion.current) throw new Error('La sesión cambió.');
      sessionRef.current = next;
      setSession(next);
      setUser(refreshedUser);
      return next;
    })();
    refreshRef.current = pending;
    try {
      return await pending;
    } catch (error) {
      if ((isUnauthorized(error) || (axios.isAxiosError(error) && error.response?.status === 403))
        && version === authVersion.current) await signOut();
      throw error;
    } finally {
      if (refreshRef.current === pending) refreshRef.current = null;
    }
  }

  async function withAccessToken<T>(request: (token: string) => Promise<T>): Promise<T> {
    return requestWithSession(sessionRef.current, renewSession, request);
  }

  useEffect(() => {
    if (!session) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      if (!active || !sessionRef.current) return;
      if (sessionRef.current.expires_at > Date.now() + REFRESH_MARGIN_MS) return;
      try {
        await renewSession();
      } catch {
        if (active && sessionRef.current) timer = setTimeout(() => void check(), 30_000);
      }
    };
    timer = setTimeout(() => void check(), Math.max(0, session.expires_at - Date.now() - REFRESH_MARGIN_MS));
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    return () => { active = false; clearTimeout(timer); subscription.remove(); };
  }, [session]);

  function updateUser(changes: Pick<User, 'nombre'>) {
    setUser((current) => current ? { ...current, ...changes } : current);
  }

  return (
    <AuthContext.Provider value={{ user, isRestoringSession, signIn, startSession, signOut, withAccessToken, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('AuthProvider es obligatorio');
  return context;
}
