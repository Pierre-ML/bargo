import { json, erreur, exigerSession, lireJson } from '../../../lib/api.js';
import { marquerNotificationsLues } from '../../../lib/db.ts';

export const prerender = false;

export async function POST({ locals, request }) {
  const refus = exigerSession(locals);
  if (refus) return refus;
  const corps = (await lireJson(request)) ?? {};
  const id = corps.id;
  if (id !== undefined && id !== null && (typeof id !== 'string' || id === '')) return erreur('Identifiant invalide.', 400);
  const n = marquerNotificationsLues(locals.user.id, id ?? null);
  return json({ ok: true, modifiees: n });
}
