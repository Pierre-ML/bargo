import { json, erreur, exigerSession } from '../../../lib/api.js';
import { rechercherUtilisateurs, listerAmis, listerDemandesEnvoyees } from '../../../lib/db.ts';
import { urlFichier } from '../../../lib/stockage.js';

export const prerender = false;

export function GET({ locals, url }) {
  const refus = exigerSession(locals);
  if (refus) return refus;
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 50);
  if (q.length < 2) return erreur('Saisis au moins 2 caractères.', 400);
  const moi = locals.user.id;
  const amis = new Set(listerAmis(moi).map((a) => a.id));
  const envoyees = new Set(listerDemandesEnvoyees(moi).map((a) => a.id));
  const utilisateurs = rechercherUtilisateurs(moi, q).map((u) => ({
    id: u.id,
    pseudo: u.pseudo || 'Utilisateur',
    avatar: urlFichier(u.avatar),
    decoration: urlFichier(u.decoration),
    ami: amis.has(u.id),
    envoyee: envoyees.has(u.id),
  }));
  return json({ utilisateurs });
}
