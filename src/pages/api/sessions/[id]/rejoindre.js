// POST /api/sessions/{id}/rejoindre : accepte SON invitation (supprimée, puis ajout aux membres, en transaction).
// Sans corps. 200 { ok: true } | 401 | 404 (pas d'invitation).
import { json, erreur, exigerSession } from '../../../../lib/api.js';
import { rejoindreSession } from '../../../../lib/db.ts';

export const prerender = false;

export async function POST({ locals, params }) {
  const refus = exigerSession(locals);
  if (refus) return refus;
  const r = rejoindreSession(String(params.id ?? ''), locals.user.id);
  if (!r.ok) return erreur(r.erreur, r.status);
  return json({ ok: true });
}
