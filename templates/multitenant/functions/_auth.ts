import type { Env } from './_lib';

export const COOKIE = 'pp_session';
export const SESSION_SECONDS = 60 * 60 * 24 * 7;
const ITERATIONS = 100_000; // the Workers runtime rejects more

const enc = new TextEncoder();
const toHex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export const randomHex = (bytes = 32) => toHex(crypto.getRandomValues(new Uint8Array(bytes)));
export const sha256 = async (s: string) => toHex(await crypto.subtle.digest('SHA-256', enc.encode(s)));

async function pbkdf2(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}

// Same format as scripts/reset-password.mjs: pbkdf2$<iter>$<salt b64>$<hash b64>
export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(await pbkdf2(password, salt, ITERATIONS))}`;
}

const DUMMY_HASH = 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

// `stored` is undefined/null for unknown emails and Google-only accounts: we still burn the same CPU, then fail.
export async function verifyPassword(password: string, stored: string | null | undefined) {
  const [scheme, iter, salt, hash] = (stored || DUMMY_HASH).split('$');
  if (scheme !== 'pbkdf2') return false;
  const got = await pbkdf2(password, fromB64(salt), Number(iter));
  const want = fromB64(hash);
  let diff = got.length ^ want.length;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ (want[i] ?? 0);
  return diff === 0 && !!stored;
}

export const getCookie = (req: Request, name: string) =>
  req.headers.get('cookie')?.split(/;\s*/).find((c) => c.startsWith(name + '='))?.slice(name.length + 1);

export const sessionCookie = (value: string, maxAge: number) =>
  `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

export async function createSession(env: Env, userId: number) {
  const token = randomHex(32);
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

export interface SessionUser {
  id: number;
  email: string;
  tenant_id: number;
  tenant_name: string;
  role: string;
}

export async function currentUser(env: Env, req: Request) {
  const token = getCookie(req, COOKIE);
  if (!token) return null;
  return env.DB.prepare(
    `SELECT u.id, u.email, u.role, u.tenant_id, t.name AS tenant_name
     FROM sessions s JOIN users u ON u.id = s.user_id JOIN tenants t ON t.id = u.tenant_id
     WHERE s.token_hash = ?1 AND s.expires_at > ?2`
  )
    .bind(await sha256(token), Math.floor(Date.now() / 1000))
    .first<SessionUser>();
}

// Creates a new tenant and its owner in one transaction. Throws on a duplicate email (UNIQUE), leaving nothing behind.
export async function createTenantUser(
  env: Env,
  o: { email: string; workspace: string; passwordHash?: string; googleSub?: string }
) {
  const res = await env.DB.batch([
    env.DB.prepare('INSERT INTO tenants (name) VALUES (?1)').bind(o.workspace),
    env.DB.prepare(
      `INSERT INTO users (tenant_id, email, password_hash, google_sub, email_verified, role)
       VALUES (last_insert_rowid(), ?1, ?2, ?3, ?4, 'owner')`
    ).bind(o.email, o.passwordHash ?? null, o.googleSub ?? null, o.googleSub ? 1 : 0),
    env.DB.prepare('SELECT last_insert_rowid() AS id'),
  ]);
  return (res[2].results[0] as { id: number }).id;
}
