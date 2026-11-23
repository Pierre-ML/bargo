// POST /api/boutique/equiper  { article_id } -> { ok: true, type }
// L'article doit être possédé ; le slot dépend du type de l'article.
export const prerender = false;

import { json, erreur, exigerSession, lireJson } from '../../../lib/api.js';
import { limiterDebit } from '../../../lib/limite-debit.js';
import { equiperArticle } from '../../../lib/db.ts';

const STATUTS = { introuvable: 404, non_possede: 403 };
const MESSAGES = { introuvable: 'Article introuvable.', non_possede: 'Vous ne possédez pas cet article.' };

export async function POST({ request, locals }) {
  const refus = exigerSession(locals);
  if (refus) return refus;

  const lim = limiterDebit('equiper:' + locals.user.id, 60, 60 * 1000);
  if (lim.limited) return erreur('Trop de requêtes, réessayez dans un instant.', 429);

  const corps = await lireJson(request);
  const articleId = corps?.article_id;
  if (typeof articleId !== 'string' || articleId === '' || articleId.length > 40) {
    return erreur('article_id requis.', 400);
  }

  const res = equiperArticle(locals.user.id, articleId);
  if (!res.ok) return erreur(MESSAGES[res.code] ?? 'Impossible.', STATUTS[res.code] ?? 400);
  return json({ ok: true, type: res.type });
}
