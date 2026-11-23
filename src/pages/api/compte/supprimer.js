// POST /api/compte/supprimer { mot_de_passe } -> { ok: true }
// Vérifie le mot de passe, supprime le compte (CASCADE) et l'avatar, efface les cookies.
import { auth } from '../../../lib/auth.js';
import { json, erreur, exigerSession, lireJson, limiter, reinitialiserLimite } from '../../../lib/api.js';
import { supprimerCompte } from '../../../lib/db.ts';
import { supprimerFichier } from '../../../lib/stockage.js';

export const prerender = false;

const efface = (nom, secure = false) =>
  `${nom}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;

export async function POST({ request, locals }) {
  const refus = exigerSession(locals);
  if (refus) return refus;

  const corps = await lireJson(request);
  if (!corps || typeof corps.mot_de_passe !== 'string' || corps.mot_de_passe === '') {
    return erreur('Mot de passe requis.', 400);
  }

  const cle = 'suppression:' + locals.user.id;
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

  const { supprime, avatar } = supprimerCompte(locals.user.id);
  if (!supprime) return erreur('Compte introuvable.', 404);
  if (avatar) {
    try { await supprimerFichier(avatar); } catch (e) { console.error('[compte] suppression avatar :', e); }
  }

  const reponse = json({ ok: true });
  const secure = new URL(request.url).protocol === 'https:';
  const cookies = [
    efface('better-auth.session_token'), efface('better-auth.session_data'),
    efface('pb_token'), efface('pb_user_id'),
  ];
  if (secure) cookies.push(efface('__Secure-better-auth.session_token', true), efface('__Secure-better-auth.session_data', true));
  for (const c of cookies) reponse.headers.append('Set-Cookie', c);
  return reponse;
}
