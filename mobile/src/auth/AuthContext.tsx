import { createContext, PropsWithChildren, useContext, useState } from 'react';
import { login, User } from '../api/auth';

type AuthState = {
  user: User | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
};
const AuthContext = createContext<AuthState | undefined>(undefined);

// First increment: keep only the verified profile in memory, never credentials on disk.
export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  async function signIn(email: string, password: string) {
    setUser(await login(email, password));
  }
  return (
    <AuthContext.Provider value={{ user, signIn, signOut: () => setUser(null) }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('AuthProvider es obligatorio');
  return context;
}
