// DELETE /api/admin/sessions/{id} : supprime une session de barathon
export const prerender = false;

import { exigerAdmin, json, erreur } from '../../../../lib/api.js';
import { proteger, idDeParams } from '../../../../lib/admin-api.js';
import { adminSupprimerSession } from '../../../../lib/db.ts';

export async function DELETE({ locals, params }) {
  const refus = exigerAdmin(locals);
  if (refus) return refus;
  return proteger(async () => {
    const id = idDeParams(params);
    if (!adminSupprimerSession(id)) return erreur('Session introuvable.', 404);
    return json({ ok: true });
  });
}
