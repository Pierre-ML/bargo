// Rate limiting en mémoire (process Node unique, pas de Redis en prod actuellement).
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;

const attempts = new Map();

/**
 * @param {string} key - identifiant du client (IP)
 * @returns {{ limited: boolean, retryAfter?: number }}
 */
export function checkRateLimit(key) {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { limited: false };
  }

  if (entry.count >= MAX_ATTEMPTS) {
    return { limited: true, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }

  entry.count += 1;
  return { limited: false };
}

export function resetRateLimit(key) {
  attempts.delete(key);
}
