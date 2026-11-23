// DELETE /api/sessions/{id}/participants/{userId} : retire un membre ou annule une invitation (hôte)
import { json, erreur } from '../../../../../lib/api.js';
import { chargerSession } from '../../../../../lib/sessionApi.js';
import { retirerParticipantSession } from '../../../../../lib/db.ts';

export const prerender = false;

export async function DELETE(ctx) {
  const { refus, id } = chargerSession(ctx, 'hote');
  if (refus) return refus;
  const cible = ctx.params.userId;
  if (typeof cible !== 'string' || cible.length === 0 || cible.length > 40) return erreur('Utilisateur invalide.', 400);
  const r = retirerParticipantSession(id, cible);
  if (!r.ok) return erreur(r.erreur, r.status);
  return json({ ok: true });
}
