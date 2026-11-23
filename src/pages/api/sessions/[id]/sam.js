// POST /api/sessions/{id}/sam : { user_id, sam: bool } désigne / retire un SAM (hôte).
// Le SAM doit être l'hôte, un membre ou un invité de la session.
import { json, erreur, lireJson } from '../../../../lib/api.js';
import { chargerSession } from '../../../../lib/sessionApi.js';
import { definirSamSession } from '../../../../lib/db.ts';

export const prerender = false;

export async function POST(ctx) {
  const { refus, id } = chargerSession(ctx, 'hote');
  if (refus) return refus;
  const corps = await lireJson(ctx.request);
  if (!corps || typeof corps.sam !== 'boolean') return erreur('Requête invalide.', 400);
  const r = definirSamSession(id, corps.user_id, corps.sam);
  if (!r.ok) return erreur(r.erreur, r.status);
  return json({ ok: true });
}
