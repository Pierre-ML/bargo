// POST /api/sessions/{id}/bar-suivant : passe au bar suivant (hôte ou SAM, session en cours). Sans corps.
// Réponse : { bar_actuel }
import { json, erreur } from '../../../../lib/api.js';
import { chargerSession } from '../../../../lib/sessionApi.js';
import { barSuivantSession } from '../../../../lib/db.ts';

export const prerender = false;

export async function POST(ctx) {
  const { refus, id } = chargerSession(ctx, 'hote_ou_sam');
  if (refus) return refus;
  const n = barSuivantSession(id);
  if (n === null) return erreur('Impossible de passer au bar suivant.', 409);
  return json({ bar_actuel: n });
}
