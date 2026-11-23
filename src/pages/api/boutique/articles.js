// GET /api/boutique/articles?type=&page= -> { items, total, totalPages, points }
// Lecture publique du catalogue ; possede / equipe / favori / points ne sont
// renseignés que pour l'utilisateur connecté (session).
export const prerender = false;

import { json, erreur } from '../../../lib/api.js';
import { listerArticlesPourUtilisateur } from '../../../lib/db.ts';

const PAR_PAGE = 12;

export async function GET({ url, locals }) {
  const type = url.searchParams.get('type') ?? 'decoration_avatar';
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  if (!['decoration_avatar', 'theme', 'titre'].includes(type)) return erreur('Type invalide.', 400);

  const { items, total } = listerArticlesPourUtilisateur(locals.user?.id ?? null, type, page, PAR_PAGE);
  return json({
    items,
    total,
    totalPages: Math.ceil(total / PAR_PAGE),
    points: locals.droits ? locals.droits.points : null,
  });
}
