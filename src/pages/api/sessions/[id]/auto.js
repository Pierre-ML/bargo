// POST /api/sessions/{id}/auto : applique le lancement / la fin automatiques selon les dates
// de la session (décidé par le serveur, aucune valeur du client). Réservé aux participants. Sans corps.
// Réponse : { etat }
import { json } from '../../../../lib/api.js';
import { chargerSession } from '../../../../lib/sessionApi.js';
import { appliquerTransitionAutoSession } from '../../../../lib/db.ts';

export const prerender = false;

export async function POST(ctx) {
  const { refus, id } = chargerSession(ctx, 'acces');
  if (refus) return refus;
  return json({ etat: appliquerTransitionAutoSession(id) });
}
