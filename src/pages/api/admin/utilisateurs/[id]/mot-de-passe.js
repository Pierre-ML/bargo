// POST /api/admin/utilisateurs/{id}/mot-de-passe
// Génère un mot de passe temporaire aléatoire, l'enregistre pour le compte et
// le renvoie UNE SEULE FOIS à l'admin (qui le transmet à l'utilisateur).
// Seule façon de se reconnecter pour les comptes migrés de PocketBase.
// Le mot de passe n'est jamais journalisé ni conservé en clair.
export const prerender = false;

import { randomInt } from 'node:crypto';
import { exigerAdmin, json, erreur } from '../../../../../lib/api.js';
import { proteger, idDeParams } from '../../../../../lib/admin-api.js';
import { definirMotDePasse } from '../../../../../lib/auth.js';
import { adminGetUtilisateur } from '../../../../../lib/db.ts';

// Sans caractères ambigus (0/O, 1/l/I) pour être dicté ou recopié facilement.
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function genererMotDePasse(longueur = 12) {
  let mdp = '';
  for (let i = 0; i < longueur; i++) mdp += ALPHABET[randomInt(ALPHABET.length)]; // sans biais
  return mdp;
}

export async function POST({ locals, params }) {
  const refus = exigerAdmin(locals);
  if (refus) return refus;
  return proteger(async () => {
    const id = idDeParams(params);
    if (!adminGetUtilisateur(id)) return erreur('Utilisateur introuvable.', 404);
    const motDePasse = genererMotDePasse();
    if (!(await definirMotDePasse(id, motDePasse))) {
      return erreur("Impossible d'enregistrer le mot de passe.", 500);
    }
    // json() envoie Cache-Control: no-store
    return json({ ok: true, motDePasse });
  });
}
