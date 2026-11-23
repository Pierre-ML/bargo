import { json, erreur, exigerSession, lireJson } from '../../../lib/api.js';
import { repondreInvitationSession } from '../../../lib/db.ts';

export const prerender = false;

// Corps : { session_id, accepter: boolean }
export async function POST({ locals, request }) {
  const refus = exigerSession(locals);
  if (refus) return refus;
  const corps = await lireJson(request);
  if (typeof corps?.session_id !== 'string' || corps.session_id === '' || typeof corps.accepter !== 'boolean') {
    return erreur('Requête invalide.', 400);
  }
  if (!repondreInvitationSession(locals.user.id, corps.session_id, corps.accepter)) {
    return erreur('Invitation introuvable.', 404);
  }
  return json({ ok: true });
}
