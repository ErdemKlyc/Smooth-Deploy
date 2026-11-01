import { createSession, createTenantUser, getCookie, sessionCookie, SESSION_SECONDS } from '../../../_auth';
import type { Env } from '../../../_lib';

const OAUTH_COOKIE = 'pp_oauth';
const clearOauth = `${OAUTH_COOKIE}=; Path=/api/auth/google; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

function jwtPayload(jwt: string) {
  const part = jwt.split('.')[1] ?? '';
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
}

// Step 2: Google sends the browser back here with ?code=...&state=...
export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const url = new URL(request.url);
  const back = (headers: Headers) => new Response(null, { status: 302, headers });
  const fail = (msg: string) => {
    const h = new Headers({ location: `/?auth_error=${encodeURIComponent(msg)}` });
    h.append('set-cookie', clearOauth);
    return back(h);
  };

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return fail('Google sign-in is not configured');
  if (url.searchParams.get('error')) return fail('Google sign-in was cancelled');
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state || state !== getCookie(request, OAUTH_COOKIE)) return fail('Sign-in expired. Please try again.');

  // The code goes straight to Google over TLS with our client secret. The id_token that comes back is therefore
  // trusted without checking its signature (Google's documented option), but we still check the claims.
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${url.origin}/api/auth/google/callback`,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) return fail('Google rejected the sign-in. Please try again.');
  const { id_token } = (await tokenRes.json()) as { id_token?: string };
  if (!id_token) return fail('Google rejected the sign-in. Please try again.');

  const p = jwtPayload(id_token) as {
    iss: string; aud: string; exp: number; sub: string; email?: string; email_verified?: boolean; name?: string; given_name?: string;
  };
  const issuerOk = p.iss === 'https://accounts.google.com' || p.iss === 'accounts.google.com';
  if (!issuerOk || p.aud !== env.GOOGLE_CLIENT_ID || p.exp < Date.now() / 1000 || !p.sub) return fail('Invalid Google response');
  if (!p.email || p.email_verified !== true) return fail('Your Google email address is not verified');
  const email = p.email.toLowerCase();

  // 1) Known Google account.
  let userId = (await env.DB.prepare('SELECT id FROM users WHERE google_sub = ?1').bind(p.sub).first<{ id: number }>())?.id;

  if (!userId) {
    // 2) Same email already registered?
    const existing = await env.DB.prepare('SELECT id, google_sub, email_verified FROM users WHERE email = ?1')
      .bind(email)
      .first<{ id: number; google_sub: string | null; email_verified: number }>();

    if (existing?.google_sub) return fail('This email is linked to a different Google account');
    if (existing) {
      userId = existing.id;
      if (existing.email_verified) {
        // Verified owner of this email: just link.
        await env.DB.prepare('UPDATE users SET google_sub = ?1 WHERE id = ?2').bind(p.sub, userId).run();
      } else {
        // Password signup that never proved ownership of the email. Google just did, so this person is the
        // real owner. Drop the password and every session so a squatter who registered first is locked out.
        await env.DB.batch([
          env.DB.prepare(
            'UPDATE users SET google_sub = ?1, email_verified = 1, password_hash = NULL, failed_count = 0, locked_until = 0 WHERE id = ?2'
          ).bind(p.sub, userId),
          env.DB.prepare('DELETE FROM sessions WHERE user_id = ?1').bind(userId),
        ]);
      }
    } else {
      // 3) New person: new tenant, they own it.
      const workspace = `${p.given_name || p.name || email.split('@')[0]}'s workspace`.slice(0, 80);
      userId = await createTenantUser(env, { email, workspace, googleSub: p.sub });
    }
  }

  const token = await createSession(env, userId);
  const h = new Headers({ location: '/' });
  h.append('set-cookie', sessionCookie(token, SESSION_SECONDS));
  h.append('set-cookie', clearOauth);
  return back(h);
};
