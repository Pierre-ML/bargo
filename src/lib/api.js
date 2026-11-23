// =====================================================================
// BARGO : utilitaires communs à toutes les routes /api.
// =====================================================================

/** Réponse JSON. */
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** Réponse d'erreur JSON : { error: message }. */
export function erreur(message, status = 400) {
  return json({ error: message }, status);
}

/** Retourne une Response 401 si personne n'est connecté, sinon null. */
export function exigerSession(locals) {
  if (!locals?.user) return erreur('Connexion requise.', 401);
  return null;
}

/** Retourne une Response 401 (non connecté) ou 403 (pas admin), sinon null. */
export function exigerAdmin(locals) {
  const refus = exigerSession(locals);
  if (refus) return refus;
  if (locals.droits?.admin !== true) return erreur('Accès réservé aux administrateurs.', 403);
  return null;
}

/** Lit le corps JSON de la requête ; null s'il est absent ou invalide. */
export async function lireJson(request) {
  try {
    const data = await request.json();
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

/**
 * Adresse IP du client derrière le reverse proxy : DERNIER élément de
 * X-Forwarded-For (celui ajouté par notre proxy ; les premiers peuvent être
 * inventés par le client pour contourner le rate-limit).
 */
export function ipClient(request, clientAddress) {
  const transmise = request.headers.get('x-forwarded-for')?.split(',').pop()?.trim();
  if (transmise) return transmise;
  try {
    return clientAddress ?? 'inconnue';
  } catch {
    return 'inconnue';
  }
}

// ---------------------------------------------------------------------
// Rate limiting en mémoire (ancien backend/rateLimit.js, supprimé) : process Node
// unique, pas de Redis. 5 tentatives par fenêtre de 15 minutes et par clé.
// Préfixer la clé par l'action : limiter('connexion:' + ip).
// ---------------------------------------------------------------------
const FENETRE_MS = 15 * 60 * 1000;
const MAX_TENTATIVES = 5;
const tentatives = new Map();

/**
 * @param {string} cle - identifiant du client (action + IP, par exemple)
 * @returns {{ limited: boolean, retryAfter?: number }}
 */
export function limiter(cle) {
  const now = Date.now();

  // Ménage pour que la Map ne grossisse pas indéfiniment
  if (tentatives.size > 10000) {
    for (const [k, v] of tentatives) if (now > v.resetAt) tentatives.delete(k);
  }

  const entree = tentatives.get(cle);
  if (!entree || now > entree.resetAt) {
    tentatives.set(cle, { count: 1, resetAt: now + FENETRE_MS });
    return { limited: false };
  }

  if (entree.count >= MAX_TENTATIVES) {
    return { limited: true, retryAfter: Math.ceil((entree.resetAt - now) / 1000) };
  }

  entree.count += 1;
  return { limited: false };
}

/** Remet à zéro le compteur d'une clé (ex. après une connexion réussie). */
export function reinitialiserLimite(cle) {
  tentatives.delete(cle);
}

// ---------------------------------------------------------------------
// Cookies better-auth
// ---------------------------------------------------------------------

/**
 * Redirection (302 par défaut) qui recopie les Set-Cookie renvoyés par
 * better-auth (returnHeaders: true) : cookie de session à la connexion,
 * effacement à la déconnexion. `extra` : Set-Cookie supplémentaires.
 */
export function redirigerAvecCookies(location, headersAuth, status = 302, extra = []) {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' });
  for (const c of headersAuth?.getSetCookie?.() ?? []) headers.append('Set-Cookie', c);
  for (const c of extra) headers.append('Set-Cookie', c);
  return new Response(null, { status, headers });
}

/** Chemin de redirection sûr : chemin relatif "/..." uniquement, sinon `defaut`. */
export function cheminSur(valeur, defaut = '/') {
  if (typeof valeur !== 'string') return defaut;
  if (!valeur.startsWith('/') || valeur.startsWith('//') || valeur.includes('\\')) return defaut;
  if (/[\u0000-\u001f\u007f]/.test(valeur)) return defaut;
  return valeur;
}
