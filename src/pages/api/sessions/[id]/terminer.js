// POST /api/sessions/{id}/terminer : en_cours -> fini (hôte). Sans corps.
// Les points sont attribués côté serveur (une seule fois, dans la même transaction).
// Réponse : { base, total, abonnement, multiplicateur, bars_visites,
//             classement: [{ id, pseudo, prenom, nom, avatar, points }] }
// (base / total = gain de l'appelant)
import { json, erreur } from '../../../../lib/api.js';
import { chargerSession } from '../../../../lib/sessionApi.js';
import { terminerSession, classementSession } from '../../../../lib/db.ts';

export const prerender = false;

export async function POST(ctx) {
  const { refus, id, userId } = chargerSession(ctx, 'hote');
  if (refus) return refus;
  const gains = terminerSession(id);
  if (!gains) return erreur("Cette session n'est pas en cours.", 409);
  const moi = gains.find((g) => g.user_id === userId);
  return json({
    base: moi?.base ?? 0,
    total: moi?.total ?? 0,
    abonnement: moi?.abonnement ?? 'Gratuit',
    multiplicateur: moi?.multiplicateur ?? 1,
    bars_visites: moi?.bars_visites ?? 0,
    classement: classementSession(id),
  });
}
