// PATCH /api/admin/utilisateurs/{id}  : modifie les droits (JSON : admin, verifie, abonnement, points)
// DELETE /api/admin/utilisateurs/{id} : supprime le compte et son avatar
export const prerender = false;

import { exigerAdmin, json, erreur, lireJson } from '../../../../lib/api.js';
import { proteger, ErreurAdmin, idDeParams, lireEntier, lireChoix, effacerFichiers } from '../../../../lib/admin-api.js';
import { adminMettreAJourDroits, adminSupprimerUtilisateur } from '../../../../lib/db.ts';

const ABONNEMENTS = ['Gratuit', 'VIP', 'Premium'];

export async function PATCH({ request, locals, params }) {
  const refus = exigerAdmin(locals);
  if (refus) return refus;
  return proteger(async () => {
    const id = idDeParams(params);
    const corps = await lireJson(request);
    if (!corps) throw new ErreurAdmin('Corps JSON invalide.');

    const champs = {};
    for (const cle of ['admin', 'verifie']) {
      if (!Object.prototype.hasOwnProperty.call(corps, cle)) continue;
      if (typeof corps[cle] !== 'boolean') throw new ErreurAdmin(`Valeur « ${cle} » invalide.`);
      champs[cle] = corps[cle];
    }
    if (Object.prototype.hasOwnProperty.call(corps, 'abonnement')) {
      champs.abonnement = lireChoix(corps.abonnement, ABONNEMENTS, "L'abonnement");
    }
    if (Object.prototype.hasOwnProperty.call(corps, 'points')) {
      champs.points = lireEntier(corps.points, { min: 0, max: 1_000_000_000, nom: 'Les points' });
    }
    if (Object.keys(champs).length === 0) throw new ErreurAdmin('Aucune modification demandée.');

    // Un admin ne peut pas se retirer lui-même le statut admin.
    if (id === locals.user.id && champs.admin === false) {
      return erreur('Tu ne peux pas retirer ton propre statut administrateur.', 403);
    }

    if (!adminMettreAJourDroits(id, champs)) return erreur('Utilisateur introuvable.', 404);
    return json({ ok: true });
  });
}

export async function DELETE({ locals, params }) {
  const refus = exigerAdmin(locals);
  if (refus) return refus;
  return proteger(async () => {
    const id = idDeParams(params);
    if (id === locals.user.id) return erreur('Tu ne peux pas supprimer ton propre compte ici.', 403);
    const { existe, avatar } = adminSupprimerUtilisateur(id);
    if (!existe) return erreur('Utilisateur introuvable.', 404);
    await effacerFichiers([avatar]);
    return json({ ok: true });
  });
}
