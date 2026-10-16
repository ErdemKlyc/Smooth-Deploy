import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, onUnauthorized } from './api';

interface AuthState {
  email: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState>(null!);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.me().then((u) => setEmail(u.email)).catch(() => setEmail(null)).finally(() => setLoading(false));
    return onUnauthorized(() => setEmail(null));
  }, []);

  const login = useCallback(async (e: string, p: string) => setEmail((await api.login(e, p)).email), []);
  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    setEmail(null);
  }, []);

  return <Ctx.Provider value={{ email, loading, login, logout }}>{children}</Ctx.Provider>;
}
