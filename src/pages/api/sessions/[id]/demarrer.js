// POST /api/sessions/{id}/demarrer : pas_commencer -> en_cours (hôte, au moins un SAM). Sans corps.
import { json, erreur } from '../../../../lib/api.js';
import { chargerSession } from '../../../../lib/sessionApi.js';
import { demarrerSession } from '../../../../lib/db.ts';

export const prerender = false;

export async function POST(ctx) {
  const { refus, id } = chargerSession(ctx, 'hote');
  if (refus) return refus;
  const r = demarrerSession(id);
  if (!r.ok) return erreur(r.erreur, r.status);
  return json({ ok: true, etat: 'en_cours' });
}
