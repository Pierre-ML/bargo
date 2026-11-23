// POST /api/compte/mot-de-passe { ancien, nouveau } -> { ok: true }
// Change le mot de passe via better-auth (vérifie l'ancien, révoque les autres sessions).
import { auth } from '../../../lib/auth.js';
import { json, erreur, exigerSession, lireJson, limiter, reinitialiserLimite } from '../../../lib/api.js';

export const prerender = false;

export async function POST({ request, locals }) {
  const refus = exigerSession(locals);
  if (refus) return refus;

  const corps = await lireJson(request);
  if (!corps || typeof corps.ancien !== 'string' || typeof corps.nouveau !== 'string') {
    return erreur('Requête invalide.', 400);
  }
  if (corps.nouveau.length < 8 || corps.nouveau.length > 128) {
    return erreur('Le mot de passe doit contenir entre 8 et 128 caractères.', 400);
  }

  const cle = 'mdp:' + locals.user.id;
  const { limited, retryAfter } = limiter(cle);
  if (limited) {
    const r = erreur('Trop de tentatives. Réessayez dans quelques minutes.', 429);
    r.headers.set('Retry-After', String(retryAfter));
    return r;
  }

  try {
    const { headers } = await auth.api.changePassword({
      body: { currentPassword: corps.ancien, newPassword: corps.nouveau, revokeOtherSessions: true },
      headers: request.headers,
      returnHeaders: true,
    });
    reinitialiserLimite(cle);
    const reponse = json({ ok: true });
    // revokeOtherSessions fournit un nouveau cookie de session
    for (const c of headers?.getSetCookie?.() ?? []) reponse.headers.append('Set-Cookie', c);
    return reponse;
  } catch {
    return erreur('Mot de passe actuel incorrect.', 400);
  }
}
