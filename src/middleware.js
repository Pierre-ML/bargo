// =====================================================================
// BARGO : middleware global.
// 1. Anti-CSRF (checkOrigin est désactivé dans astro.config.mjs).
// 2. Session better-auth -> Astro.locals.user / session / droits.
// =====================================================================
import { defineMiddleware } from 'astro:middleware';
import { getSecret } from 'astro:env/server';
import { auth } from './lib/auth.js';
import { getDroits } from './lib/db.ts';

const METHODES_SURES = new Set(['GET', 'HEAD', 'OPTIONS']);

// Host public du site (ex. derrière nginx, si le Host transmis diffère).
const hostPublic = (() => {
  try {
    return new URL(getSecret('BETTER_AUTH_URL')).host;
  } catch {
    return null;
  }
})();

/**
 * Anti-CSRF volontairement simple : un navigateur envoie toujours l'en-tête
 * Origin sur une requête POST/PUT/PATCH/DELETE venant d'un autre site (et un
 * site tiers ne peut pas le falsifier). Donc, pour toute méthode qui modifie
 * des données : si Origin est présent et que son host n'est ni celui de la
 * requête ni celui de BETTER_AUTH_URL, on refuse (403). Sans Origin (curl,
 * scripts serveur, très vieux navigateurs), on laisse passer : ce ne sont
 * pas des requêtes forgées par un site tiers dans le navigateur d'un visiteur.
 * Les cookies SameSite=Lax ajoutent une seconde barrière.
 */
function origineEtrangere(request) {
  if (METHODES_SURES.has(request.method)) return false;
  const origin = request.headers.get('origin');
  if (!origin) return false;
  let hostOrigine;
  try {
    hostOrigine = new URL(origin).host; // "null" ou valeur invalide -> catch
  } catch {
    return true;
  }
  const hostRequete = new URL(request.url).host;
  return hostOrigine !== hostRequete && hostOrigine !== hostPublic;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, locals } = context;

  if (origineEtrangere(request)) {
    return new Response('Origine refusée.', { status: 403 });
  }

  locals.user = null;
  locals.session = null;
  locals.droits = null;

  let cookiesSession = [];
  try {
    // returnHeaders : better-auth peut prolonger la session et renvoyer un
    // nouveau cookie ; on le recopie sur la réponse plus bas.
    const { headers, response } = await auth.api.getSession({
      headers: request.headers,
      returnHeaders: true,
    });
    if (response?.user) {
      const u = response.user;
      locals.user = { id: u.id, email: u.email, name: u.name };
      locals.session = response.session;
      locals.droits = getDroits(u.id);
    }
    cookiesSession = headers?.getSetCookie?.() ?? [];
  } catch (e) {
    console.error('[middleware] lecture de session impossible :', e);
  }

  const reponse = await next();

  // Uniquement si la page/route n'a pas déjà posé ses propres cookies
  // (connexion, déconnexion...) : sinon on écraserait le nouveau cookie.
  if (cookiesSession.length && reponse.headers.getSetCookie().length === 0) {
    try {
      for (const c of cookiesSession) reponse.headers.append('Set-Cookie', c);
    } catch {
      // En-têtes immuables (réponse relayée telle quelle) : on ignore.
    }
  }
  return reponse;
});
