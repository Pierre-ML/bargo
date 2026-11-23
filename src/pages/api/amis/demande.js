import { json, erreur, exigerSession, lireJson, limiter, ipClient } from '../../../lib/api.js';
import { envoyerDemandeAmi } from '../../../lib/db.ts';

export const prerender = false;

export async function POST({ request, locals, clientAddress }) {
  const refus = exigerSession(locals);
  if (refus) return refus;
  const lim = limiter('demande-ami:' + locals.user.id + ':' + ipClient(request, clientAddress));
  if (lim.limited) return erreur('Trop de demandes, réessaie plus tard.', 429);

  const corps = await lireJson(request);
  const amiId = corps?.ami_id;
  if (typeof amiId !== 'string' || amiId === '') return erreur('ami_id manquant.', 400);

  const res = envoyerDemandeAmi(locals.user.id, amiId);
  if (res === 'soi') return erreur('Tu ne peux pas t\'ajouter toi-même.', 400);
  if (res === 'inconnu') return erreur('Utilisateur introuvable.', 404);
  if (res === 'deja_amis') return erreur('Vous êtes déjà amis.', 409);
  return json({ ok: true, etat: res === 'amis' ? 'ami' : 'envoyee' });
}
