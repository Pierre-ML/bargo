// POST /api/sessions/{id}/invitations : { user_id, sam?: bool } invite un AMI de l'hôte (hôte)
import { json, erreur, lireJson } from '../../../../lib/api.js';
import { chargerSession } from '../../../../lib/sessionApi.js';
import { inviterSession } from '../../../../lib/db.ts';

export const prerender = false;

export async function POST(ctx) {
  const { refus, id, userId } = chargerSession(ctx, 'hote');
  if (refus) return refus;
  const corps = await lireJson(ctx.request);
  if (!corps) return erreur('Requête invalide.', 400);
  const r = inviterSession(id, userId, corps.user_id, corps.sam === true);
  if (!r.ok) return erreur(r.erreur, r.status);
  return json({ ok: true }, 201);
}
