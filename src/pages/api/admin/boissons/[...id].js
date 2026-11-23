// POST /api/admin/boissons        : crée une boisson (multipart/form-data : nom, image)
// PATCH /api/admin/boissons/{id}  : modifie une boisson
// DELETE /api/admin/boissons/{id} : supprime une boisson et son image
export const prerender = false;

import { exigerAdmin, json, erreur } from '../../../../lib/api.js';
import {
  proteger, ErreurAdmin, idDeParams, lireFormData, lireTexte,
  lireImages, stockerImages, effacerFichiers,
} from '../../../../lib/admin-api.js';
import {
  nouvelId, adminGetBoisson, adminEnregistrerBoisson, adminSupprimerBoisson,
} from '../../../../lib/db.ts';

async function enregistrer(request, idExistant) {
  const fd = await lireFormData(request);
  const creation = idExistant === null;
  const existant = creation ? null : adminGetBoisson(idExistant);
  if (!creation && !existant) throw new ErreurAdmin('Boisson introuvable.', 404);
  const id = creation ? nouvelId() : idExistant;

  const nom = lireTexte(fd.get('nom'), { max: 200, requis: true, nom: 'Le nom' });
  const images = await lireImages(fd, 'image', { maxNombre: 1 });

  const [cle] = await stockerImages('boisson', id, 'image', images);
  try {
    adminEnregistrerBoisson(id, nom, cle ?? null);
  } catch (e) {
    await effacerFichiers([cle]);
    throw e;
  }
  if (cle && existant?.image) await effacerFichiers([existant.image]);
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
    const { existe, image } = adminSupprimerBoisson(id);
    if (!existe) return erreur('Boisson introuvable.', 404);
    await effacerFichiers([image]);
    return json({ ok: true });
  });
}
