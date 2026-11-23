import { json, erreur, exigerSession, lireJson } from '../../../lib/api.js';
import { refuserDemandeAmi } from '../../../lib/db.ts';

export const prerender = false;

export async function POST({ locals, request }) {
  const refus = exigerSession(locals);
  if (refus) return refus;
  const corps = await lireJson(request);
  const amiId = corps?.ami_id;
  if (typeof amiId !== 'string' || amiId === '') return erreur('ami_id manquant.', 400);
  if (!refuserDemandeAmi(locals.user.id, amiId)) return erreur('Aucune demande de cet utilisateur.', 404);
  return json({ ok: true });
}
