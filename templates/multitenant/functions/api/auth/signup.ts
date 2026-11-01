import { createSession, createTenantUser, hashPassword, sessionCookie, SESSION_SECONDS } from '../../_auth';
import { Env, bad, body, str } from '../../_lib';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Email + password signup. Creates a new tenant (workspace) with this user as owner.
// The email is NOT verified. That is why Google sign-in may later take over an unverified password account (see google/callback.ts).
export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  const b = await body<{ email: string; password: string; workspace: string }>(request);
  const email = str(b.email).toLowerCase();
  const password = typeof b.password === 'string' ? b.password : '';
  if (!EMAIL.test(email) || email.length > 254) return bad('Enter a valid email address');
  if (password.length < 10 || password.length > 200) return bad('Password must be 10 to 200 characters');
  const workspace = str(b.workspace).slice(0, 80) || `${email.split('@')[0]}'s workspace`;

  let userId: number;
  try {
    userId = await createTenantUser(env, { email, workspace, passwordHash: await hashPassword(password) });
  } catch (e) {
    if (String(e).includes('UNIQUE')) return bad('An account with this email already exists', 409);
    throw e;
  }

  const token = await createSession(env, userId);
  return new Response(JSON.stringify({ email, workspace }), {
    status: 201,
    headers: { 'content-type': 'application/json', 'set-cookie': sessionCookie(token, SESSION_SECONDS) },
  });
};
