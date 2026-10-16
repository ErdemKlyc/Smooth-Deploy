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

export const api = {
  me: () => req<{ email: string }>('/auth/me'),
  login: (email: string, password: string) => req<{ email: string }>('/auth/login', 'POST', { email, password }),
  logout: () => req<{ ok: true }>('/auth/logout', 'POST', {}),
  // App-specific endpoints go here.
};
