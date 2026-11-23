import { json, exigerSession } from '../../../lib/api.js';
import { listerAmis, listerDemandesRecues, listerDemandesEnvoyees } from '../../../lib/db.ts';
import { versPersonne } from '../../../lib/personnes.js';

export const prerender = false;

export function GET({ locals }) {
  const refus = exigerSession(locals);
  if (refus) return refus;
  const id = locals.user.id;
  return json({
    amis: listerAmis(id).map(versPersonne),
    recues: listerDemandesRecues(id).map(versPersonne),
    envoyees: listerDemandesEnvoyees(id).map(versPersonne),
  });
}
