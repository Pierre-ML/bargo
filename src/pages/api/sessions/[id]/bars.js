// PUT /api/sessions/{id}/bars : { bars: [id, ...] } remplace le parcours, dans l'ordre (hôte, avant le lancement)
import { json, erreur, lireJson } from '../../../../lib/api.js';
import { chargerSession } from '../../../../lib/sessionApi.js';
import { definirBarsSession } from '../../../../lib/db.ts';

export const prerender = false;

export async function PUT(ctx) {
  const { refus, id } = chargerSession(ctx, 'hote');
  if (refus) return refus;
  const corps = await lireJson(ctx.request);
  if (!corps) return erreur('Requête invalide.', 400);
  const r = definirBarsSession(id, corps.bars);
  if (!r.ok) return erreur(r.erreur, r.status);
  return json({ ok: true });
}
