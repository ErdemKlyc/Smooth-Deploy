import type { Env } from './_lib';

export const COOKIE = 'pp_session';
export const SESSION_SECONDS = 60 * 60 * 24 * 7;
const ITERATIONS = 100_000;

const enc = new TextEncoder();
const toHex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export const sha256 = async (s: string) => toHex(await crypto.subtle.digest('SHA-256', enc.encode(s)));

async function pbkdf2(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}

const DUMMY_HASH = 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

export async function verifyPassword(password: string, stored: string | undefined) {
  const [scheme, iter, salt, hash] = (stored ?? DUMMY_HASH).split('$');
  if (scheme !== 'pbkdf2') return false;
  const got = await pbkdf2(password, fromB64(salt), Number(iter));
  const want = fromB64(hash);
  let diff = got.length ^ want.length;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ (want[i] ?? 0);
  return diff === 0 && stored !== undefined;
}

export const getCookie = (req: Request, name: string) =>
  req.headers.get('cookie')?.split(/;\s*/).find((c) => c.startsWith(name + '='))?.slice(name.length + 1);

export const sessionCookie = (value: string, maxAge: number) =>
  `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

export async function createSession(env: Env, userId: number) {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const now = Math.floor(Date.now() / 1000);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?1').bind(now),
    env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?1, ?2, ?3)').bind(
      await sha256(token),
      userId,
      now + SESSION_SECONDS
    ),
  ]);
  return token;
}

export async function currentUser(env: Env, req: Request) {
  const token = getCookie(req, COOKIE);
  if (!token) return null;
  return env.DB.prepare(
    `SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?1 AND s.expires_at > ?2`
  )
    .bind(await sha256(token), Math.floor(Date.now() / 1000))
    .first<{ id: number; email: string }>();
}
