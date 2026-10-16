export interface Env {
  DB: D1Database;
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

export const bad = (msg: string, status = 400) => json({ error: msg }, status);

export const body = async <T>(req: Request): Promise<Partial<T>> => {
  try {
    return (await req.json()) as Partial<T>;
  } catch {
    return {};
  }
};

export const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v.trim() : fallback);
