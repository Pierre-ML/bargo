// Sert les images stockées (voir src/lib/stockage.js).
// Catalogue (bar, boisson, jeu, boutique) : public. Avatars : connexion requise.
import { cleValide, lireFichier } from '../../lib/stockage.js';

export const prerender = false;

export async function GET({ params, locals }) {
  const cle = params.cle;
  if (!cleValide(cle)) return new Response('Introuvable', { status: 404 });

  const prive = cle.startsWith('avatar/');
  if (prive && !locals?.user) return new Response('Non autorisé', { status: 401 });

  const fichier = await lireFichier(cle);
  if (!fichier) return new Response('Introuvable', { status: 404 });

  return new Response(fichier.corps, {
    status: 200,
    headers: {
      'Content-Type': fichier.type,
      'Content-Length': String(fichier.taille),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': prive ? 'private, max-age=3600' : 'public, max-age=86400',
    },
  });
}
