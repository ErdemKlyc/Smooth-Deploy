import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, Me, onUnauthorized } from './api';

interface AuthState {
  email: string | null;
  workspace: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, workspace: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState>(null!);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.me().then(setMe).catch(() => setMe(null)).finally(() => setLoading(false));
    return onUnauthorized(() => setMe(null));
  }, []);

  const login = useCallback(async (e: string, p: string) => setMe(await api.login(e, p)), []);
  const signup = useCallback(async (e: string, p: string, w: string) => setMe(await api.signup(e, p, w)), []);
  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    setMe(null);
  }, []);

  return (
    <Ctx.Provider value={{ email: me?.email ?? null, workspace: me?.workspace ?? null, loading, login, signup, logout }}>
      {children}
    </Ctx.Provider>
  );
}
