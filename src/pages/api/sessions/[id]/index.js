// PATCH  /api/sessions/{id} : paramètres { nom, description, date_depart, date_arrivee, automatique } (hôte)
// DELETE /api/sessions/{id} : supprime la session (hôte)
import { json, erreur, lireJson } from '../../../../lib/api.js';
import { chargerSession } from '../../../../lib/sessionApi.js';
import { modifierParametresSession, supprimerSession } from '../../../../lib/db.ts';

export const prerender = false;

export async function PATCH(ctx) {
  const { refus, id } = chargerSession(ctx, 'hote');
  if (refus) return refus;
  const corps = await lireJson(ctx.request);
  if (!corps) return erreur('Requête invalide.', 400);
  const r = modifierParametresSession(id, corps);
  if (!r.ok) return erreur(r.erreur, r.status);
  return json({ ok: true });
}

export async function DELETE(ctx) {
  const { refus, id } = chargerSession(ctx, 'hote');
  if (refus) return refus;
  supprimerSession(id);
  return json({ ok: true });
}
