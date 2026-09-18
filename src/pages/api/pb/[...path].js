// Relais authentifié vers PocketBase pour les appels que le navigateur a besoin
// de faire APRÈS le chargement initial de la page (favoris, amis, sessions,
// panneau admin, jeux...). Le navigateur ne parle jamais directement à
// PocketBase : il appelle cette route, qui tourne côté serveur et relaie vers
// PB_URL (127.0.0.1, privé).
//
// - Le token n'est JAMAIS lu depuis une requête du client : il est repris du
//   cookie httpOnly pb_token, posé à la connexion. Le client n'a donc plus
//   besoin de connaître le token PocketBase du tout.
// - Seules les collections listées dans ALLOWED_COLLECTIONS sont accessibles,
//   et uniquement via /api/collections/{collection}/records... ou l'action
//   publique auth-methods (nécessaire pour démarrer l'OAuth Google). Tout le
//   reste (dont les collections internes comme _superusers, ou l'échange
//   OAuth complet, géré par /api/oauth/callback) renvoie 404.
import { PB_URL } from '../../../../backend/backend.js';

export const prerender = false;

const ALLOWED_COLLECTIONS = new Set([
  'users',
  'bar',
  'boison',
  'boutique',
  'jeux',
  'jeux_questionaire',
  'session_barathon',
  'notifications',
]);

function isAllowedPath(segments) {
  if (segments[0] !== 'collections') return false;
  const collection = segments[1];
  if (!collection || !ALLOWED_COLLECTIONS.has(collection)) return false;

  const action = segments[2];
  if (action === 'records') return true; // records, records/{id}
  if (action === 'auth-methods' && collection === 'users') return true; // requis pour démarrer l'OAuth Google

  return false;
}

async function handle({ request, cookies, params }) {
  const segments = (params.path ?? '').split('/').filter(Boolean);

  if (!isAllowedPath(segments)) {
    return json({ error: 'not_found' }, 404);
  }

  const url = new URL(request.url);
  const target = `${PB_URL}/api/${segments.join('/')}${url.search}`;

  const headers = new Headers();
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);

  const token = cookies.get('pb_token')?.value;
  if (token) headers.set('authorization', `Bearer ${token}`);

  const method = request.method;
  const hasBody = method !== 'GET' && method !== 'HEAD' && method !== 'DELETE';

  let upstream;
  try {
    upstream = await fetch(target, {
      method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
    });
  } catch {
    return json({ error: 'bad_gateway' }, 502);
  }

  const resHeaders = new Headers();
  const upstreamContentType = upstream.headers.get('content-type');
  if (upstreamContentType) resHeaders.set('content-type', upstreamContentType);

  return new Response(upstream.body, { status: upstream.status, headers: resHeaders });
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
