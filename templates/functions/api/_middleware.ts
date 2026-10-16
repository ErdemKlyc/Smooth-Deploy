import { currentUser } from '../_auth';
import { Env, bad } from '../_lib';

export const onRequest: PagesFunction<Env> = async (ctx) => {
  if (new URL(ctx.request.url).pathname === '/api/auth/login') return ctx.next();
  const user = await currentUser(ctx.env, ctx.request);
  if (!user) return bad('unauthorized', 401);
  ctx.data.user = user;
  return ctx.next();
};
