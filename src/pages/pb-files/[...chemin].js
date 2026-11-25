// Relais public pour les fichiers PocketBase (images bar, jeux, avatars, etc.).
// PocketBase est sur une URL publique (PB_URL) : cette route va chercher le
// fichier côté serveur et le sert depuis la même origine que le site.
// La vraie protection reste les API rules de PocketBase.
//
// N'accepte QUE les chemins à 3 segments : /pb-files/{collection}/{id}/{fichier}
// (le format exact de l'API fichiers de PocketBase). Tout le reste (routes à
// 4+ segments, collections internes comme _superusers, etc.) renvoie 404, afin
// que cette route ne puisse jamais servir à explorer le reste de l'API
// PocketBase ni son panneau d'admin.
import { PB_URL } from '../../../backend/backend.js';

export const prerender = false;

export async function GET({ params }) {
  const segments = (params.chemin ?? '').split('/').filter(Boolean);

  if (segments.length !== 3) {
    return new Response('Not found', { status: 404 });
  }

  const [collection, recordId, filename] = segments;

  // Collections internes de PocketBase (superusers, etc.) : jamais servies ici.
  if (collection.startsWith('_')) {
    return new Response('Not found', { status: 404 });
  }

  let upstream;
  try {
    upstream = await fetch(
      `${PB_URL}/api/files/${encodeURIComponent(collection)}/${encodeURIComponent(recordId)}/${encodeURIComponent(filename)}`
    );
  } catch {
    return new Response('Bad gateway', { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return new Response('Not found', { status: 404 });
  }

  const headers = new Headers();
  const contentType = upstream.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  headers.set('cache-control', 'public, max-age=3600');

  return new Response(upstream.body, { status: 200, headers });
}
