import { COOKIE, getCookie, sessionCookie, sha256 } from '../../_auth';
import type { Env } from '../../_lib';

export const onRequestPost: PagesFunction<Env> = async ({ env, request }) => {
  const token = getCookie(request, COOKIE);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(await sha256(token)).run();
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'content-type': 'application/json', 'set-cookie': sessionCookie('', 0) },
  });
};
