// POST /api/admin/bars        : crée un bar (multipart/form-data)
// PATCH /api/admin/bars/{id}  : modifie un bar
// DELETE /api/admin/bars/{id} : supprime un bar et ses images
export const prerender = false;

import { exigerAdmin, json, erreur } from '../../../../lib/api.js';
import {
  proteger, ErreurAdmin, idDeParams, lireFormData, lireTexte, lireNombre,
  lireImages, stockerImages, effacerFichiers, lireClesARetirer,
} from '../../../../lib/admin-api.js';
import { nouvelId, getBar, adminEnregistrerBar, adminSupprimerBar } from '../../../../lib/db.ts';

const HORAIRES = [
  'horaires_lundi', 'horaires_mardi', 'horaires_mercredi', 'horaires_jeudi',
  'horaires_vendredi', 'horaires_samedi', 'horaires_dimanche',
];
const MAX_IMAGES_PAR_TYPE = 20;
const REGEX_ID = /^[A-Za-z0-9_-]{1,40}$/;

async function enregistrer(request, idExistant) {
  const fd = await lireFormData(request);
  const creation = idExistant === null;
  const existant = creation ? null : getBar(idExistant);
  if (!creation && !existant) throw new ErreurAdmin('Bar introuvable.', 404);
  const id = creation ? nouvelId() : idExistant;

  // ----- Champs (en modification : seulement ceux envoyés) -----
  const champs = {};
  if (creation || fd.has('nom')) {
    champs.nom = lireTexte(fd.get('nom'), { max: 200, requis: true, nom: 'Le nom' });
  }
  if (creation || fd.has('description')) {
    champs.description = lireTexte(fd.get('description'), { max: 5000, nom: 'La description' }) ?? '';
  }
  if (creation || fd.has('adresse')) {
    champs.adresse = lireTexte(fd.get('adresse'), { max: 300, nom: "L'adresse" });
  }
  for (const h of HORAIRES) {
    if (creation || fd.has(h)) champs[h] = lireTexte(fd.get(h), { max: 100, nom: 'Les horaires' });
  }
  if (creation || fd.has('latitude') || fd.has('longitude')) {
    const lat = lireNombre(fd.get('latitude'), { min: -90, max: 90, nom: 'La latitude' });
    const lon = lireNombre(fd.get('longitude'), { min: -180, max: 180, nom: 'La longitude' });
    if ((lat === null) !== (lon === null)) {
      throw new ErreurAdmin('Renseigne la latitude ET la longitude (ou aucune des deux).');
    }
    champs.latitude = lat;
    champs.longitude = lon;
  }

  // ----- Boissons liées (remplacement complet si le marqueur est présent) -----
  let boissons;
  if (fd.has('boissons_maj')) {
    boissons = [...new Set(fd.getAll('boissons').filter((v) => typeof v === 'string' && REGEX_ID.test(v)))];
  }

  // ----- Images : vérifiées AVANT toute écriture -----
  const nouvelles = {
    img: await lireImages(fd, 'img_ajouter'),
    galerie: await lireImages(fd, 'galerie_ajouter'),
  };
  const retirer = {
    img: lireClesARetirer(fd, 'img_retirer'),
    galerie: lireClesARetirer(fd, 'galerie_retirer'),
  };
  const actuelles = { img: existant?.images ?? [], galerie: existant?.galerie ?? [] };
  for (const type of ['img', 'galerie']) {
    const retirees = actuelles[type].filter((f) => retirer[type].includes(f)).length;
    if (actuelles[type].length - retirees + nouvelles[type].length > MAX_IMAGES_PAR_TYPE) {
      throw new ErreurAdmin(`Trop d'images (${MAX_IMAGES_PAR_TYPE} maximum par catégorie).`);
    }
  }

  // ----- Écriture : fichiers, puis base ; nettoyage si la base échoue -----
  const ecrites = [];
  try {
    const images = {};
    for (const type of ['img', 'galerie']) {
      const cles = await stockerImages('bar', id, type, nouvelles[type]);
      ecrites.push(...cles);
      if (cles.length || retirer[type].length) images[type] = { retirer: retirer[type], ajouter: cles };
    }
    const { supprimes } = adminEnregistrerBar(id, champs, { boissons, images });
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
    const { existe, fichiers } = adminSupprimerBar(id);
    if (!existe) return erreur('Bar introuvable.', 404);
    await effacerFichiers(fichiers);
    return json({ ok: true });
  });
}
