// POST /api/admin/boutique        : crée un article (multipart/form-data)
// PATCH /api/admin/boutique/{id}  : modifie un article
// DELETE /api/admin/boutique/{id} : supprime un article (possessions et favoris en cascade)
//
// Champs : nom, prix (entier >= 0), type (decoration_avatar | theme | titre),
// titre (texte, type titre uniquement) ou image (fichier, autres types).
export const prerender = false;

import { exigerAdmin, json, erreur } from '../../../../lib/api.js';
import {
  proteger, ErreurAdmin, idDeParams, lireFormData, lireTexte, lireEntier, lireChoix,
  lireImages, stockerImages, effacerFichiers,
} from '../../../../lib/admin-api.js';
import {
  nouvelId, getArticle, adminEnregistrerArticle, adminSupprimerArticle,
} from '../../../../lib/db.ts';

const TYPES = ['decoration_avatar', 'theme', 'titre'];

async function enregistrer(request, idExistant) {
  const fd = await lireFormData(request);
  const creation = idExistant === null;
  const existant = creation ? null : getArticle(idExistant);
  if (!creation && !existant) throw new ErreurAdmin('Article introuvable.', 404);
  const id = creation ? nouvelId() : idExistant;

  const nom = creation || fd.has('nom')
    ? lireTexte(fd.get('nom'), { max: 200, requis: true, nom: 'Le nom' })
    : existant.nom;
  const prix = creation || fd.has('prix')
    ? lireEntier(fd.get('prix'), { min: 0, max: 1_000_000_000, nom: 'Le prix' })
    : existant.prix;
  const type = creation || fd.has('type') ? lireChoix(fd.get('type'), TYPES, 'Le type') : existant.type;

  let titre = null;
  let imageFinale = null;
  let aEffacer = [];
  const nouvelles = await lireImages(fd, 'image', { maxNombre: 1 });

  if (type === 'titre') {
    titre = fd.has('titre')
      ? lireTexte(fd.get('titre'), { max: 100, requis: true, nom: 'Le texte du titre' })
      : existant?.titre ?? null;
    if (!titre) throw new ErreurAdmin('Le texte du titre est obligatoire.');
    if (existant?.image) aEffacer.push(existant.image); // un titre n'a pas d'image
  } else {
    imageFinale = existant?.image ?? null;
    if (nouvelles.length === 0 && !imageFinale) {
      throw new ErreurAdmin("Une image est obligatoire pour ce type d'article.");
    }
  }

  // Un titre n'a pas d'image : un éventuel fichier envoyé est ignoré.
  const [cle] = await stockerImages('boutique', id, 'image', type === 'titre' ? [] : nouvelles);
  try {
    if (cle) {
      if (imageFinale) aEffacer.push(imageFinale);
      imageFinale = cle;
    }
    adminEnregistrerArticle(id, { nom, prix, type, image: imageFinale, titre });
  } catch (e) {
    await effacerFichiers([cle]);
    throw e;
  }
  await effacerFichiers(aEffacer);
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
    const { existe, image } = adminSupprimerArticle(id);
    if (!existe) return erreur('Article introuvable.', 404);
    await effacerFichiers([image]);
    return json({ ok: true });
  });
}
