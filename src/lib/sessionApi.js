// =====================================================================
// BARGO : aide commune aux routes /api/sessions/{id}/...
// Contrôle d'accès centralisé : l'utilisateur courant est TOUJOURS
// locals.user.id, jamais une valeur envoyée par le client.
// =====================================================================
import { erreur, exigerSession } from './api.js';
import { getRoleSession } from './db.ts';

/**
 * Charge la session et vérifie les droits.
 * - exigence 'acces'  : hôte, membre ou invité ;
 * - exigence 'hote'   : hôte uniquement ;
 * - exigence 'hote_ou_sam' : hôte ou SAM de la session.
 * Retourne { refus } (Response 401/403/404) ou { role, userId, id }.
 * Quelqu'un qui n'a aucun lien avec la session reçoit 404 (on ne révèle
 * pas son existence).
 */
export function chargerSession({ locals, params }, exigence = 'acces') {
  const refus = exigerSession(locals);
  if (refus) return { refus };
  const id = params.id;
  if (typeof id !== 'string' || id.length === 0 || id.length > 40) return { refus: erreur('Session introuvable.', 404) };
  const userId = locals.user.id;
  const role = getRoleSession(id, userId);
  if (!role || !role.acces) return { refus: erreur('Session introuvable.', 404) };
  if (exigence === 'hote' && !role.hote) return { refus: erreur('Réservé à l\'hôte de la session.', 403) };
  if (exigence === 'hote_ou_sam' && !(role.hote || role.sam)) {
    return { refus: erreur('Réservé à l\'hôte ou à un SAM de la session.', 403) };
  }
  return { role, userId, id };
}
