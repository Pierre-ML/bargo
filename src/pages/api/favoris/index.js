import { json, erreur, exigerSession, lireJson } from '../../../lib/api.js';
import { basculerFavori, typeFavoriValide } from '../../../lib/db.ts';

export const prerender = false;

export async function POST({ locals, request }) {
  const refus = exigerSession(locals);
  if (refus) return refus;
  const corps = await lireJson(request);
  if (!typeFavoriValide(corps?.type)) return erreur('Type de favori invalide.', 400);
  if (typeof corps.id !== 'string' || corps.id === '' || corps.id.length > 50) return erreur('Identifiant invalide.', 400);
  const res = basculerFavori(locals.user.id, corps.type, corps.id);
  if (!res) return erreur('Élément introuvable.', 404);
  return json(res);
}
