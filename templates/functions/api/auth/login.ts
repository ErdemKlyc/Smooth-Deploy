import { createSession, sessionCookie, SESSION_SECONDS, verifyPassword } from '../../_auth';
import { Env, bad, body, str } from '../../_lib';

const MAX_FAILS = 5;
const LOCK_SECONDS = 15 * 60;

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  const b = await body<{ email: string; password: string }>(request);
  const email = str(b.email).toLowerCase();
  const password = typeof b.password === 'string' ? b.password : '';
  if (!email || !password) return bad('Email and password are required');

  const now = Math.floor(Date.now() / 1000);
  const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?1')
    .bind(email)
    .first<{ id: number; email: string; password_hash: string; failed_count: number; locked_until: number }>();

  if (user && user.locked_until > now) return bad('Too many attempts. Try again later.', 429);

  const ok = await verifyPassword(password, user?.password_hash);
  if (!ok || !user) {
    if (user) {
      const fails = user.failed_count + 1;
      await env.DB.prepare('UPDATE users SET failed_count = ?1, locked_until = ?2 WHERE id = ?3')
        .bind(fails >= MAX_FAILS ? 0 : fails, fails >= MAX_FAILS ? now + LOCK_SECONDS : 0, user.id)
        .run();
    }
    return bad('Invalid email or password', 401);
  }

  await env.DB.prepare('UPDATE users SET failed_count = 0, locked_until = 0 WHERE id = ?1').bind(user.id).run();
  const token = await createSession(env, user.id);
  return new Response(JSON.stringify({ email: user.email }), {
    headers: { 'content-type': 'application/json', 'set-cookie': sessionCookie(token, SESSION_SECONDS) },
  });
};
