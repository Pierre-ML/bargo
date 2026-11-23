// POST /api/sessions/{id}/refuser : refuse SON invitation (supprimée). Sans corps.
// 200 { ok: true } | 401 | 404 (pas d'invitation).
import { json, erreur, exigerSession } from '../../../../lib/api.js';
import { refuserInvitationSession } from '../../../../lib/db.ts';

export const prerender = false;

export async function POST({ locals, params }) {
  const refus = exigerSession(locals);
  if (refus) return refus;
  const r = refuserInvitationSession(String(params.id ?? ''), locals.user.id);
  if (!r.ok) return erreur(r.erreur, r.status);
  return json({ ok: true });
}
