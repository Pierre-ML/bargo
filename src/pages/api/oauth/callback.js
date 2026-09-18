// Échange du code OAuth Google contre un token PocketBase — côté serveur.
// Le token PocketBase n'est jamais renvoyé au navigateur : il est posé
// directement dans un cookie httpOnly, comme pour la connexion classique.
import { PB_URL } from '../../../../backend/backend.js';

export const prerender = false;

export async function POST({ request, cookies }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  const { code, codeVerifier, redirectUrl } = body ?? {};
  if (!code || !codeVerifier || !redirectUrl) {
    return json({ error: 'missing_params' }, 400);
  }

  let res;
  try {
    res = await fetch(`${PB_URL}/api/collections/users/auth-with-oauth2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'google',
        code,
        codeVerifier,
        redirectUrl,
        createData: { abonnements: 'Gratuit' },
      }),
    });
  } catch {
    return json({ error: 'bad_gateway' }, 502);
  }

  const data = await res.json().catch(() => null);

  if (!res.ok || !data?.token || !data?.record?.id) {
    return json({ error: data?.message || 'oauth_failed', data: data?.data }, res.status || 400);
  }

  const maxAge = 60 * 60 * 24 * 7;
  cookies.set('pb_token', data.token, { path: '/', httpOnly: true, maxAge });
  cookies.set('pb_user_id', data.record.id, { path: '/', httpOnly: true, maxAge });

  return json({ redirect: data.record.pseudo ? '/profil' : '/bienvenue' });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
}
