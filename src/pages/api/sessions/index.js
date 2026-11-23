// POST /api/sessions : crée une session dont l'hôte est l'utilisateur connecté.
// Corps : { nom, description?, date_depart?, date_arrivee?, automatique?,
//           bars?: [id], jeu_id?, invites?: [id d'amis], sam?: [id] }
// Réponse : 201 { id }
import { json, erreur, exigerSession, lireJson } from '../../../lib/api.js';
import { creerSession } from '../../../lib/db.ts';

export const prerender = false;

export async function POST({ request, locals }) {
  const refus = exigerSession(locals);
  if (refus) return refus;
  const corps = await lireJson(request);
  if (!corps) return erreur('Requête invalide.', 400);
  const r = creerSession(locals.user.id, corps);
  if (!r.ok) return erreur(r.erreur, r.status);
  return json({ id: r.id }, 201);
}
