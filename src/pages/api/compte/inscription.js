// Inscription rapide (formulaire de la landing page, appel fetch).
// Crée le compte via better-auth et renvoie le cookie de session httpOnly.
import { inscrire } from '../../../lib/inscription.js';
import { json, erreur, lireJson, limiter, ipClient } from '../../../lib/api.js';

export const prerender = false;

export async function POST({ request, clientAddress, locals }) {
  if (locals.user) return erreur('Vous êtes déjà connecté.', 400);

  const corps = await lireJson(request);
  if (!corps) return erreur('Requête invalide.', 400);
  if (corps.cgu !== true) return erreur("Veuillez accepter les conditions d'utilisation.", 400);

  const { limited, retryAfter } = limiter('inscription:' + ipClient(request, clientAddress));
  if (limited) {
    const r = erreur('Trop de tentatives. Réessayez dans quelques minutes.', 429);
    r.headers.set('Retry-After', String(retryAfter));
    return r;
  }

  const resultat = await inscrire({
    pseudo: corps.pseudo,
    email: corps.email,
    password: corps.password,
    passwordConfirm: corps.passwordConfirm,
    headers: request.headers,
  });
  if (!resultat.ok) return erreur(resultat.error, resultat.status);

  const reponse = json({ ok: true, redirect: '/bienvenue' }, 201);
  for (const c of resultat.headers.getSetCookie()) reponse.headers.append('Set-Cookie', c);
  return reponse;
}
