// POST /api/admin/jeux        : crée un jeu (multipart/form-data)
// PATCH /api/admin/jeux/{id}  : modifie un jeu (nom, description, type, images)
// DELETE /api/admin/jeux/{id} : supprime un jeu et ses images
export const prerender = false;

import { exigerAdmin, json, erreur } from '../../../../lib/api.js';
import {
  proteger, ErreurAdmin, idDeParams, lireFormData, lireTexte, lireChoix,
  lireImages, stockerImages, effacerFichiers, lireClesARetirer,
} from '../../../../lib/admin-api.js';
import {
  nouvelId, getJeu, adminEnregistrerJeu, adminSupprimerJeu,
} from '../../../../lib/db.ts';

const TYPES = ['questionaire', 'memorie', 'reflex', 'rythme'];
const MAX_IMAGES = 20;

async function enregistrer(request, idExistant) {
  const fd = await lireFormData(request);
  const creation = idExistant === null;
  const existant = creation ? null : getJeu(idExistant);
  if (!creation && !existant) throw new ErreurAdmin('Jeu introuvable.', 404);
  const id = creation ? nouvelId() : idExistant;

  const champs = {};
  if (creation || fd.has('nom')) {
    champs.nom = lireTexte(fd.get('nom'), { max: 200, requis: true, nom: 'Le nom' });
  }
  if (creation || fd.has('description')) {
    champs.description = lireTexte(fd.get('description'), { max: 5000, nom: 'La description' }) ?? '';
  }
  if (creation || fd.has('type')) {
    const t = fd.get('type');
    champs.type = t === null || t === '' ? null : lireChoix(t, TYPES, 'Le type');
  }

  const nouvelles = await lireImages(fd, 'img_ajouter');
  const retirer = lireClesARetirer(fd, 'img_retirer');
  const actuelles = existant?.images ?? [];
  const retirees = actuelles.filter((f) => retirer.includes(f)).length;
  if (actuelles.length - retirees + nouvelles.length > MAX_IMAGES) {
    throw new ErreurAdmin(`Trop d'images (${MAX_IMAGES} maximum).`);
  }

  const ecrites = await stockerImages('jeu', id, 'img', nouvelles);
  try {
    const images = ecrites.length || retirer.length ? { retirer, ajouter: ecrites } : undefined;
    const { supprimes } = adminEnregistrerJeu(id, champs, images);
    await effacerFichiers(supprimes);
  } catch (e) {
    await effacerFichiers(ecrites);
    throw e;
  }
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
    const { existe, fichiers } = adminSupprimerJeu(id);
    if (!existe) return erreur('Jeu introuvable.', 404);
    await effacerFichiers(fichiers);
    return json({ ok: true });
  });
}
