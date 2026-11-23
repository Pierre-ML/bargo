// POST /api/compte/email { email, mot_de_passe } -> { ok: true }
// Change l'adresse e-mail après vérification du mot de passe.
import { auth } from '../../../lib/auth.js';
import { json, erreur, exigerSession, lireJson, limiter, reinitialiserLimite } from '../../../lib/api.js';
import { changerEmail } from '../../../lib/db.ts';

export const prerender = false;

export async function POST({ request, locals }) {
  const refus = exigerSession(locals);
  if (refus) return refus;

  const corps = await lireJson(request);
  if (!corps || typeof corps.email !== 'string' || typeof corps.mot_de_passe !== 'string') {
    return erreur('Requête invalide.', 400);
  }

  const cle = 'email:' + locals.user.id;
  const { limited, retryAfter } = limiter(cle);
  if (limited) {
    const r = erreur('Trop de tentatives. Réessayez dans quelques minutes.', 429);
    r.headers.set('Retry-After', String(retryAfter));
    return r;
  }

  try {
    await auth.api.verifyPassword({ body: { password: corps.mot_de_passe }, headers: request.headers });
  } catch {
    return erreur('Mot de passe incorrect.', 403);
  }
  reinitialiserLimite(cle);

  if (!changerEmail(locals.user.id, corps.email)) return erreur('Adresse e-mail invalide ou déjà utilisée.', 400);
  return json({ ok: true });
}
