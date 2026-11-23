import { json, exigerSession } from '../../../lib/api.js';
import { listerNotifications, listerDemandesRecues, listerInvitationsSession } from '../../../lib/db.ts';
import { versPersonne } from '../../../lib/personnes.js';

export const prerender = false;

export function GET({ locals }) {
  const refus = exigerSession(locals);
  if (refus) return refus;
  const id = locals.user.id;
  return json({
    notifications: listerNotifications(id),
    demandesAmis: listerDemandesRecues(id).map(versPersonne),
    invitationsSession: listerInvitationsSession(id).map((i) => ({
      session_id: i.session_id,
      nom: i.nom,
      hote_pseudo: i.hote_pseudo,
    })),
  });
}
