// PATCH /api/profil : met à jour les champs texte du profil de l'utilisateur connecté.
// Corps JSON : { pseudo?, prenom?, nom?, age?, ville?, description?, insta?, facebook?, discord? }
// Réponse : { ok: true }. L'avatar a sa propre route (/api/profil/avatar).
import { json, erreur, exigerSession, lireJson } from '../../../lib/api.js';
import { mettreAJourProfil } from '../../../lib/db.ts';

export const prerender = false;

const MAX = {
  pseudo: 50,
  prenom: 100,
  nom: 100,
  ville: 100,
  description: 2000,
  insta: 200,
  facebook: 200,
  discord: 200,
};

export async function PATCH({ request, locals }) {
  const refus = exigerSession(locals);
  if (refus) return refus;

  const corps = await lireJson(request);
  if (!corps) return erreur('Requête invalide.', 400);

  const champs = {};
  for (const [nom, max] of Object.entries(MAX)) {
    if (!Object.prototype.hasOwnProperty.call(corps, nom)) continue;
    const v = corps[nom];
    if (v !== null && typeof v !== 'string') return erreur(`Champ « ${nom} » invalide.`, 400);
    const texte = (v ?? '').trim();
    if (texte.length > max) return erreur(`Champ « ${nom} » trop long (${max} caractères max).`, 400);
    if (nom === 'pseudo' && texte === '') return erreur('Le pseudo ne peut pas être vide.', 400);
    champs[nom] = texte;
  }

  if (Object.prototype.hasOwnProperty.call(corps, 'age')) {
    const a = corps.age;
    if (a === null || a === '') {
      champs.age = null;
    } else {
      const n = typeof a === 'number' ? a : Number(a);
      if (!Number.isInteger(n) || n < 18 || n > 120) return erreur("L'âge doit être un entier entre 18 et 120.", 400);
      champs.age = n;
    }
  }

  if (Object.keys(champs).length === 0) return erreur('Aucun champ à modifier.', 400);

  // L'utilisateur est toujours celui de la session, jamais un id du client.
  mettreAJourProfil(locals.user.id, champs);
  return json({ ok: true });
}
