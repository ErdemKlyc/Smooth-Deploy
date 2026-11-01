const unauthorizedListeners = new Set<() => void>();
export const onUnauthorized = (fn: () => void) => {
  unauthorizedListeners.add(fn);
  return () => void unauthorizedListeners.delete(fn);
};

async function req<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: data ? { 'content-type': 'application/json' } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  });
  const out = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith('/auth/login')) unauthorizedListeners.forEach((f) => f());
  if (!res.ok) throw new Error((out as { error?: string }).error ?? `Request failed (${res.status})`);
  return out as T;
}

export interface Me {
  email: string;
  workspace: string;
}

export const api = {
  me: () => req<Me>('/auth/me'),
  login: (email: string, password: string) => req<Me>('/auth/login', 'POST', { email, password }),
  signup: (email: string, password: string, workspace: string) => req<Me>('/auth/signup', 'POST', { email, password, workspace }),
  logout: () => req<{ ok: true }>('/auth/logout', 'POST', {}),
  // App-specific endpoints go here. The server scopes them to the signed-in user's tenant; never send a tenant id.
};
