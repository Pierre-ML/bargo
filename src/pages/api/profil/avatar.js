// POST   /api/profil/avatar : multipart/form-data, champ "avatar" (image jpg/png/webp/gif, 5 Mo max)
//        -> { avatar: "<clé>", url: "/fichiers/<clé>" }
// DELETE /api/profil/avatar : supprime l'avatar -> { ok: true }
import { json, erreur, exigerSession } from '../../../lib/api.js';
import { getAvatarProfil, mettreAJourProfil, creerProfilEtDroits } from '../../../lib/db.ts';
import {
  detecterImage,
  nouvelleCleImage,
  ecrireFichier,
  supprimerFichier,
  urlFichier,
  TAILLE_MAX_IMAGE,
} from '../../../lib/stockage.js';

export const prerender = false;

export async function POST({ request, locals }) {
  const refus = exigerSession(locals);
  if (refus) return refus;

  let formulaire;
  try {
    formulaire = await request.formData();
  } catch {
    return erreur('Requête invalide.', 400);
  }
  const fichier = formulaire.get('avatar');
  if (!(fichier instanceof File) || fichier.size === 0) return erreur('Aucune image reçue.', 400);
  if (fichier.size > TAILLE_MAX_IMAGE) return erreur('Image trop lourde (5 Mo maximum).', 413);

  const donnees = Buffer.from(await fichier.arrayBuffer());
  const ext = detecterImage(donnees);
  if (!ext) return erreur('Format non pris en charge (JPG, PNG, WebP ou GIF).', 415);

  const userId = locals.user.id;
  creerProfilEtDroits(userId);
  const ancienne = getAvatarProfil(userId);
  const cle = nouvelleCleImage('avatar', userId, 'avatar', ext);

  await ecrireFichier(cle, donnees);
  mettreAJourProfil(userId, { avatar: cle });
  if (ancienne && ancienne !== cle) {
    try { await supprimerFichier(ancienne); } catch (e) { console.error('[avatar] suppression ancienne image :', e); }
  }
  return json({ avatar: cle, url: urlFichier(cle) });
}

export async function DELETE({ locals }) {
  const refus = exigerSession(locals);
  if (refus) return refus;

  const userId = locals.user.id;
  const ancienne = getAvatarProfil(userId);
  mettreAJourProfil(userId, { avatar: null });
  if (ancienne) {
    try { await supprimerFichier(ancienne); } catch (e) { console.error('[avatar] suppression image :', e); }
  }
  return json({ ok: true });
}
