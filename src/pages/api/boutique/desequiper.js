// POST /api/boutique/desequiper  { type: 'decoration_avatar'|'titre'|'theme' } -> { ok: true }
export const prerender = false;

import { json, erreur, exigerSession, lireJson } from '../../../lib/api.js';
import { limiterDebit } from '../../../lib/limite-debit.js';
import { desequiperType } from '../../../lib/db.ts';

export async function POST({ request, locals }) {
  const refus = exigerSession(locals);
  if (refus) return refus;

  const lim = limiterDebit('equiper:' + locals.user.id, 60, 60 * 1000);
  if (lim.limited) return erreur('Trop de requêtes, réessayez dans un instant.', 429);

  const corps = await lireJson(request);
  if (!desequiperType(locals.user.id, typeof corps?.type === 'string' ? corps.type : '')) {
    return erreur('Type invalide.', 400);
  }
  return json({ ok: true });
}
