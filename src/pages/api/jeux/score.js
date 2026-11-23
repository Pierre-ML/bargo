// POST /api/jeux/score  { jeu: 'memorie'|'reflex'|'rythme'|'questionaire', score } -> { points, solde, plafondAtteint }
//
// LIMITE ASSUMÉE : un jeu qui tourne dans le navigateur ne peut pas être
// totalement infalsifiable (le joueur peut envoyer n'importe quel score). Le
// serveur ne croit donc jamais le score tel quel : il le borne par un maximum
// par partie et par jeu, plafonne le total de points par jour et par
// utilisateur, et impose un délai minimum entre deux parties (voir
// enregistrerPartie dans db.ts). Cela limite l'abus sans prétendre l'annuler.
export const prerender = false;

import { json, erreur, exigerSession, lireJson } from '../../../lib/api.js';
import { limiterDebit } from '../../../lib/limite-debit.js';
import { enregistrerPartie } from '../../../lib/db.ts';

export async function POST({ request, locals }) {
  const refus = exigerSession(locals);
  if (refus) return refus;

  // Garde-fou en mémoire (en plus du délai de 10 s appliqué en base)
  const lim = limiterDebit('score:' + locals.user.id, 6, 60 * 1000);
  if (lim.limited) {
    return json({ error: 'Trop de requêtes, réessayez dans un instant.', retryAfter: lim.retryAfter }, 429);
  }

  const corps = await lireJson(request);
  const jeu = corps?.jeu;
  const score = corps?.score;
  if (typeof jeu !== 'string' || typeof score !== 'number' || !Number.isFinite(score)) {
    return erreur('Requête invalide.', 400);
  }

  const res = enregistrerPartie(locals.user.id, jeu, score);
  if (!res.ok) {
    if (res.code === 'trop_rapide') {
      return json({ error: 'Trop de parties rapprochées.', retryAfter: res.retryAfter }, 429);
    }
    return erreur('Jeu inconnu.', 400);
  }
  return json({ points: res.points, solde: res.solde, plafondAtteint: res.plafondAtteint });
}
