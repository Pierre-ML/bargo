// =====================================================================
// BARGO : authentification (better-auth, e-mail + mot de passe uniquement).
//
// - Base : l'instance better-sqlite3 de db.ts (tables "user", "session",
//   "account", "verification" de sql/schema.sql).
// - Aucun fournisseur social (Google supprimé), aucun envoi d'e-mail.
// - Les droits (admin, points, abonnement, verifie) sont dans la table
//   `droits`, que better-auth ne connaît pas : ils ne sont donc ni lisibles
//   ni modifiables via /api/auth/* (pas d'additionalFields, volontairement).
// - Secrets lus dans l'environnement uniquement (rien en dur).
// =====================================================================
import { betterAuth } from 'better-auth';
import { getSecret } from 'astro:env/server';
import { db, creerProfilEtDroits, nouvelId, maintenant } from './db.ts';

// getSecret lit l'environnement à l'exécution : rien n'est inscrit en dur dans dist/.
const env = (cle) => getSecret(cle) || undefined;

const secret = env('BETTER_AUTH_SECRET');
const baseURL = env('BETTER_AUTH_URL');

if (!secret) {
  console.warn('[auth] BETTER_AUTH_SECRET manquant : définis-le dans .env (voir .env.example).');
}

export const auth = betterAuth({
  database: db,
  secret,
  baseURL,
  telemetry: { enabled: false },

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    autoSignIn: true,
  },

  // Pas d'e-mail : réinitialisation et vérification par e-mail désactivées.
  disabledPaths: [
    '/request-password-reset',
    '/reset-password',
    '/send-verification-email',
    '/verify-email',
  ],

  rateLimit: { enabled: true },

  databaseHooks: {
    user: {
      create: {
        // Chaque compte reçoit une ligne profil (pseudo = name) et une ligne
        // droits (admin=0, points=0, abonnement Gratuit, verifie=0).
        after: async (user) => {
          creerProfilEtDroits(user.id, { pseudo: user.name });
        },
      },
    },
  },

  advanced: {
    // IP client (rate-limit de /api/auth/*) : le serveur Node n'écoute qu'en
    // local derrière le reverse proxy, qui ajoute l'IP réelle à droite de
    // X-Forwarded-For ; on ne fait confiance qu'à ce proxy local.
    ipAddress: {
      ipAddressHeaders: ['x-forwarded-for'],
      trustedProxies: ['127.0.0.1', '::1'],
    },
    // Secure dès que le site est servi en HTTPS (production).
    useSecureCookies: String(baseURL ?? '').startsWith('https://'),
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    },
  },
});

/**
 * Définit (ou remplace) le mot de passe d'un utilisateur. Réservé à l'admin,
 * notamment pour les comptes migrés depuis PocketBase (sans mot de passe).
 * Retourne true si le mot de passe a été enregistré.
 */
export async function definirMotDePasse(userId, motDePasse) {
  const ctx = await auth.$context;
  const { minPasswordLength, maxPasswordLength } = ctx.password.config;
  if (typeof motDePasse !== 'string' || motDePasse.length < minPasswordLength || motDePasse.length > maxPasswordLength) {
    return false;
  }
  const utilisateur = db.prepare('SELECT id FROM "user" WHERE id = ?').get(userId);
  if (!utilisateur) return false;

  const hache = await ctx.password.hash(motDePasse);
  const date = maintenant();
  const existant = db
    .prepare("SELECT id FROM account WHERE userId = ? AND providerId = 'credential'")
    .get(userId);

  if (existant) {
    db.prepare('UPDATE account SET password = ?, updatedAt = ? WHERE id = ?').run(hache, date, existant.id);
  } else {
    db.prepare(
      `INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt)
       VALUES (?, ?, 'credential', ?, ?, ?, ?)`
    ).run(nouvelId(), userId, userId, hache, date, date);
  }
  return true;
}
