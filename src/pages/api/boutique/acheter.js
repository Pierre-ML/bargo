// POST /api/boutique/acheter  { article_id } -> { points }
// Achat atomique (voir acheterArticle) : l'utilisateur est celui de la session.
export const prerender = false;

import { json, erreur, exigerSession, lireJson } from '../../../lib/api.js';
import { limiterDebit } from '../../../lib/limite-debit.js';
import { acheterArticle } from '../../../lib/db.ts';

const STATUTS = { introuvable: 404, deja_possede: 409, points_insuffisants: 402 };
const MESSAGES = {
  introuvable: 'Article introuvable.',
  deja_possede: 'Vous possédez déjà cet article.',
  points_insuffisants: "Vous n'avez pas assez de points.",
};

export async function POST({ request, locals }) {
  const refus = exigerSession(locals);
  if (refus) return refus;

  const lim = limiterDebit('achat:' + locals.user.id, 20, 60 * 1000);
  if (lim.limited) return erreur('Trop de requêtes, réessayez dans un instant.', 429);

  const corps = await lireJson(request);
  const articleId = corps?.article_id;
  if (typeof articleId !== 'string' || articleId === '' || articleId.length > 40) {
    return erreur('article_id requis.', 400);
  }

  const res = acheterArticle(locals.user.id, articleId);
  if (!res.ok) return erreur(MESSAGES[res.code] ?? 'Achat impossible.', STATUTS[res.code] ?? 400);
  return json({ points: res.points });
}
