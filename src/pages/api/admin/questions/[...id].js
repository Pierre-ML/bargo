// POST /api/admin/questions        : crée une question de quiz (JSON)
// PATCH /api/admin/questions/{id}  : modifie une question
// DELETE /api/admin/questions/{id} : supprime une question
//
// Corps JSON : { question, choix_1..choix_4, reponse (1 à 4 = bonne réponse), theme }
export const prerender = false;

import { exigerAdmin, json, erreur, lireJson } from '../../../../lib/api.js';
import { proteger, ErreurAdmin, idDeParams, lireTexte, lireEntier, lireChoix } from '../../../../lib/admin-api.js';
import {
  nouvelId, adminQuestionExiste, adminEnregistrerQuestion, adminSupprimerQuestion,
} from '../../../../lib/db.ts';

const THEMES = ['jeux_video', 'histoire', 'cultrue_g'];

async function enregistrer(request, idExistant) {
  const corps = await lireJson(request);
  if (!corps) throw new ErreurAdmin('Corps JSON invalide.');
  const creation = idExistant === null;
  if (!creation && !adminQuestionExiste(idExistant)) throw new ErreurAdmin('Question introuvable.', 404);

  const question = lireTexte(corps.question, { max: 500, requis: true, nom: "L'intitulé" });
  const choix = [1, 2, 3, 4].map((n) => lireTexte(corps['choix_' + n], { max: 300, requis: true, nom: 'Le choix ' + n }));
  const bonne = lireEntier(corps.reponse, { min: 1, max: 4, nom: 'La bonne réponse' });
  const theme = lireChoix(corps.theme, THEMES, 'Le thème');

  const id = creation ? nouvelId() : idExistant;
  adminEnregistrerQuestion(id, { theme, question, choix, bonne });
  return json({ ok: true, id }, creation ? 201 : 200);
}

export async function POST({ request, locals, params }) {
  const refus = exigerAdmin(locals);
  if (refus) return refus;
  return proteger(async () => {
    if (idDeParams(params, true) !== null) return erreur('Méthode non autorisée.', 405);
    return enregistrer(request, null);
  });
}

export async function PATCH({ request, locals, params }) {
  const refus = exigerAdmin(locals);
  if (refus) return refus;
  return proteger(async () => {
    const id = idDeParams(params, true);
    if (id === null) return erreur('Méthode non autorisée.', 405);
    return enregistrer(request, id);
  });
}

export async function DELETE({ locals, params }) {
  const refus = exigerAdmin(locals);
  if (refus) return refus;
  return proteger(async () => {
    const id = idDeParams(params, true);
    if (id === null) return erreur('Méthode non autorisée.', 405);
    if (!adminSupprimerQuestion(id)) return erreur('Question introuvable.', 404);
    return json({ ok: true });
  });
}
