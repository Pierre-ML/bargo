// Donne (ou retire) le statut administrateur à un compte, depuis le serveur.
// Sert à créer le PREMIER administrateur : les comptes migrés de PocketBase
// n'ont pas de mot de passe, et seul un admin peut en définir un.
//
// Usage :
//   node --env-file=.env scripts/promouvoir-admin.mjs <email>          -> admin
//   node --env-file=.env scripts/promouvoir-admin.mjs <email> --retirer -> plus admin
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const email = String(process.argv[2] ?? '').trim().toLowerCase();
const retirer = process.argv.includes('--retirer');
if (!email || email.startsWith('--')) {
  console.error('Usage : node --env-file=.env scripts/promouvoir-admin.mjs <email> [--retirer]');
  process.exit(1);
}

const db = new Database(process.env.DATABASE_PATH || 'data/bargo.db', { fileMustExist: true });
const user = db.prepare('SELECT id FROM "user" WHERE lower(email) = ?').get(email);
if (!user) {
  console.error('Aucun compte avec cet e-mail. Inscris-toi d\'abord sur le site.');
  process.exit(1);
}

db.prepare('INSERT OR IGNORE INTO droits (user_id) VALUES (?)').run(user.id);
db.prepare("UPDATE droits SET admin = ?, updated = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ?")
  .run(retirer ? 0 : 1, user.id);
console.log(retirer ? 'Statut admin retiré.' : 'Compte promu administrateur.');
