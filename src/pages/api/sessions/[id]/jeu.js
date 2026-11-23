// PUT /api/sessions/{id}/jeu : { jeu_id: id | null } choisit le jeu de la session (hôte)
import { json, erreur, lireJson } from '../../../../lib/api.js';
import { chargerSession } from '../../../../lib/sessionApi.js';
import { definirJeuSession } from '../../../../lib/db.ts';

export const prerender = false;

export async function PUT(ctx) {
  const { refus, id } = chargerSession(ctx, 'hote');
  if (refus) return refus;
  const corps = await lireJson(ctx.request);
  if (!corps) return erreur('Requête invalide.', 400);
  const r = definirJeuSession(id, corps.jeu_id);
  if (!r.ok) return erreur(r.erreur, r.status);
  return json({ ok: true });
}
