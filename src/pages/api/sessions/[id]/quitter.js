// POST /api/sessions/{id}/quitter : un membre (non hôte) quitte la session. Sans corps.
import { json, erreur, exigerSession } from '../../../../lib/api.js';
import { quitterSession } from '../../../../lib/db.ts';

export const prerender = false;

export async function POST({ locals, params }) {
  const refus = exigerSession(locals);
  if (refus) return refus;
  const r = quitterSession(String(params.id ?? ''), locals.user.id);
  if (!r.ok) return erreur(r.erreur, r.status);
  return json({ ok: true });
}
