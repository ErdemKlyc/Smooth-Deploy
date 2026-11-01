import { currentUser } from '../_auth';
import { Env, bad } from '../_lib';

// Everything under /api needs a session except these. Remove the ones for sign-in methods you did not choose.
const PUBLIC = new Set([
  '/api/auth/login',
  '/api/auth/signup',
  '/api/auth/google',
  '/api/auth/google/callback',
]);

export const onRequest: PagesFunction<Env> = async (ctx) => {
  if (PUBLIC.has(new URL(ctx.request.url).pathname)) return ctx.next();
  const user = await currentUser(ctx.env, ctx.request);
  if (!user) return bad('unauthorized', 401);
  ctx.data.user = user;
  // Always scope queries with this. Never read a tenant id from the request body, query or headers.
  ctx.data.tenantId = user.tenant_id;
  return ctx.next();
};
