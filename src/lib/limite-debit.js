// =====================================================================
// Limiteur de débit en mémoire (process Node unique) : `max` appels par
// fenêtre de `fenetreMs` et par clé. Complète limiter() de api.js, dont la
// fenêtre (5 essais / 15 min) est trop stricte pour des actions normales.
// =====================================================================
const compteurs = new Map();

/** @returns {{ limited: boolean, retryAfter?: number }} */
export function limiterDebit(cle, max, fenetreMs) {
  const now = Date.now();
  if (compteurs.size > 10000) {
    for (const [k, v] of compteurs) if (now > v.resetAt) compteurs.delete(k);
  }
  const entree = compteurs.get(cle);
  if (!entree || now > entree.resetAt) {
    compteurs.set(cle, { count: 1, resetAt: now + fenetreMs });
    return { limited: false };
  }
  if (entree.count >= max) {
    return { limited: true, retryAfter: Math.ceil((entree.resetAt - now) / 1000) };
  }
  entree.count += 1;
  return { limited: false };
}
