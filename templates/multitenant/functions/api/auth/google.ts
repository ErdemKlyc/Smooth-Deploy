import { randomHex } from '../../_auth';
import { Env, bad } from '../../_lib';

// Step 1 of Google sign-in: send the browser to Google. The random `state` is also stored in a short-lived
// cookie; the callback only proceeds if both match (CSRF / login-fixation defence).
export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return bad('Google sign-in is not configured', 501);
  const origin = new URL(request.url).origin;
  const state = randomHex(16);
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${origin}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  return new Response(null, {
    status: 302,
    headers: {
      location: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
      // Path covers /api/auth/google/callback too.
      'set-cookie': `pp_oauth=${state}; Path=/api/auth/google; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
  });
};
