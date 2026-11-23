// =====================================================================
// BARGO : accès à la base SQLite (better-sqlite3), côté serveur uniquement.
//
// Règles :
// - requêtes préparées partout (jamais de valeur concaténée dans le SQL) ;
// - SQL simple et portable (compatible Cloudflare D1) : pas de trigger,
//   pas d'extension, pas de fonction propre à better-sqlite3 dans le SQL ;
// - les booléens SQLite (0/1) sont convertis en true/false dans les objets
//   retournés ;
// - les droits (admin, points, abonnement, verifie) ne sont modifiables que
//   par les fonctions "Droits" ci-dessous, appelées par du code serveur.
// =====================================================================
import { getSecret } from 'astro:env/server';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import schemaSql from '../../sql/schema.sql?raw';

// seed.sql est rempli par le script de migration ; import.meta.glob ne plante
// pas si le fichier n'existe pas (objet vide dans ce cas).
const seeds = import.meta.glob('../../sql/seed.sql', { query: '?raw', import: 'default', eager: true });
const seedSql: string = String(Object.values(seeds)[0] ?? '');

const cheminBase: string =
  getSecret('DATABASE_PATH') || 'data/bargo.db';

mkdirSync(dirname(cheminBase), { recursive: true });

export const db = new Database(cheminBase);
// Pragmas dans le code (et non dans le .sql) pour garder schema.sql compatible D1
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// ---------------------------------------------------------------------
// Initialisation : schema.sql toujours (CREATE IF NOT EXISTS : les nouvelles
// tables apparaissent), seed.sql seulement au tout premier démarrage.
// ---------------------------------------------------------------------
const premierDemarrage = !db
  .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
  .get('bar');

db.exec(schemaSql);

if (premierDemarrage && seedSql.replace(/--.*$/gm, '').trim() !== '') {
  db.transaction(() => db.exec(seedSql))();
}

// ---------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Identifiant de 15 caractères [a-z0-9], comme PocketBase. */
export function nouvelId(): string {
  let id = '';
  while (id.length < 15) {
    for (const octet of randomBytes(32)) {
      // 252 = 7 * 36 : on rejette les octets >= 252 pour éviter tout biais
      if (octet < 252 && id.length < 15) id += ALPHABET[octet % 36];
    }
  }
  return id;
}

/** Date courante en ISO 8601 UTC (même format que les DEFAULT du schéma). */
export function maintenant(): string {
  return new Date().toISOString();
}

/** Convertit en true/false les colonnes booléennes (0/1) d'une ligne. */
function booleens(ligne: any, colonnes: string[]): any {
  if (!ligne) return ligne;
  for (const c of colonnes) {
    if (c in ligne) ligne[c] = ligne[c] === 1 || ligne[c] === true;
  }
  return ligne;
}

const ABONNEMENTS = ['Gratuit', 'VIP', 'Premium'];

// =====================================================================
// Utilisateur : profil et droits
// =====================================================================

/** Crée (si absentes) la ligne profil et la ligne droits d'un utilisateur. */
export function creerProfilEtDroits(userId: string, { pseudo }: { pseudo?: string | null } = {}): void {
  db.prepare('INSERT OR IGNORE INTO profil (user_id, pseudo) VALUES (?, ?)').run(userId, pseudo ?? null);
  db.prepare('INSERT OR IGNORE INTO droits (user_id) VALUES (?)').run(userId);
}

/** Droits d'un utilisateur : { admin, points, abonnement, verifie } ou null. */
export function getDroits(userId: string) {
  const ligne = db
    .prepare('SELECT admin, points, abonnement, verifie FROM droits WHERE user_id = ?')
    .get(userId);
  return ligne ? booleens(ligne, ['admin', 'verifie']) : null;
}

/** Profil complet (privé) : colonnes de profil + id, email, name. */
export function getProfil(userId: string) {
  const ligne = db
    .prepare(
      `SELECT u.id, u.email, u.name,
              p.pseudo, p.prenom, p.nom, p.age, p.ville, p.description,
              p.insta, p.facebook, p.discord, p.avatar,
              p.equipe_decoration_id, p.equipe_titre_id, p.equipe_theme_id,
              p.created, p.updated
       FROM "user" u
       JOIN profil p ON p.user_id = u.id
       WHERE u.id = ?`
    )
    .get(userId);
  return ligne ?? null;
}

/**
 * Champs publics d'un utilisateur (jamais l'e-mail) : profil, réseaux,
 * articles équipés (image ou titre), abonnement / points / verifie en lecture.
 */
export function getUtilisateurPublic(userId: string) {
  const l: any = db
    .prepare(
      `SELECT p.user_id AS id, p.pseudo, p.prenom, p.nom, p.age, p.ville,
              p.avatar, p.description, p.insta, p.facebook, p.discord,
              d.abonnement, d.points, d.verifie,
              deco.id AS deco_id, deco.nom AS deco_nom, deco.image AS deco_image,
              ti.id AS titre_id, ti.nom AS titre_nom, ti.titre AS titre_texte,
              th.id AS theme_id, th.nom AS theme_nom, th.image AS theme_image
       FROM profil p
       LEFT JOIN droits d    ON d.user_id = p.user_id
       LEFT JOIN boutique deco ON deco.id = p.equipe_decoration_id
       LEFT JOIN boutique ti   ON ti.id   = p.equipe_titre_id
       LEFT JOIN boutique th   ON th.id   = p.equipe_theme_id
       WHERE p.user_id = ?`
    )
    .get(userId);
  if (!l) return null;
  return {
    id: l.id,
    pseudo: l.pseudo,
    prenom: l.prenom,
    nom: l.nom,
    age: l.age,
    ville: l.ville,
    avatar: l.avatar,
    description: l.description,
    insta: l.insta,
    facebook: l.facebook,
    discord: l.discord,
    abonnement: l.abonnement ?? 'Gratuit',
    points: l.points ?? 0,
    verifie: l.verifie === 1,
    decoration: l.deco_id ? { id: l.deco_id, nom: l.deco_nom, image: l.deco_image } : null,
    titre: l.titre_id ? { id: l.titre_id, nom: l.titre_nom, titre: l.titre_texte } : null,
    theme: l.theme_id ? { id: l.theme_id, nom: l.theme_nom, image: l.theme_image } : null,
  };
}

// Liste blanche FIXE des colonnes modifiables par l'utilisateur, avec leur
// longueur maximale. Aucun nom de colonne ne vient jamais de l'extérieur.
const CHAMPS_PROFIL: Record<string, number> = {
  pseudo: 50,
  prenom: 100,
  nom: 100,
  age: 0, // entier
  ville: 100,
  description: 2000,
  insta: 200,
  facebook: 200,
  discord: 200,
  avatar: 300,
};

/**
 * Met à jour le profil. N'accepte QUE les champs de la liste blanche
 * (pseudo, prenom, nom, age, ville, description, insta, facebook, discord,
 * avatar) ; tout le reste est ignoré. Retourne true si une ligne a changé.
 */
export function mettreAJourProfil(userId: string, champs: Record<string, any>): boolean {
  if (!champs || typeof champs !== 'object') return false;
  const colonnes: string[] = [];
  const valeurs: any[] = [];

  for (const [colonne, max] of Object.entries(CHAMPS_PROFIL)) {
    if (!Object.prototype.hasOwnProperty.call(champs, colonne)) continue;
    const brut = champs[colonne];
    let valeur: any = null;
    if (colonne === 'age') {
      const n = Number.parseInt(String(brut ?? ''), 10);
      valeur = Number.isInteger(n) && n >= 0 && n <= 150 ? n : null;
    } else if (brut !== null && brut !== undefined) {
      const texte = String(brut).trim().slice(0, max);
      valeur = texte === '' ? null : texte;
    }
    colonnes.push(colonne);
    valeurs.push(valeur);
  }
  if (colonnes.length === 0) return false;

  creerProfilEtDroits(userId);
  const sets = colonnes.map((c) => `${c} = ?`).join(', ');
  const res = db
    .prepare(`UPDATE profil SET ${sets}, updated = ? WHERE user_id = ?`)
    .run(...valeurs, maintenant(), userId);
  return res.changes > 0;
}

// =====================================================================
// Droits (code serveur / admin seulement, jamais exposé à l'utilisateur)
// =====================================================================

/** Ajoute (ou retire si négatif) des points. Refuse de passer sous 0. Retourne le nouveau solde ou null. */
export function ajouterPoints(userId: string, delta: number): number | null {
  if (!Number.isInteger(delta)) return null;
  const res = db
    .prepare('UPDATE droits SET points = points + ?, updated = ? WHERE user_id = ? AND points + ? >= 0')
    .run(delta, maintenant(), userId, delta);
  if (res.changes === 0) return null;
  const ligne: any = db.prepare('SELECT points FROM droits WHERE user_id = ?').get(userId);
  return ligne ? ligne.points : null;
}

/** Définit l'abonnement ('Gratuit' | 'VIP' | 'Premium'). Retourne true si appliqué. */
export function definirAbonnement(userId: string, abonnement: string): boolean {
  if (!ABONNEMENTS.includes(abonnement)) return false;
  const res = db
    .prepare('UPDATE droits SET abonnement = ?, updated = ? WHERE user_id = ?')
    .run(abonnement, maintenant(), userId);
  return res.changes > 0;
}

/** Donne / retire le rôle admin. Retourne true si appliqué. */
export function definirAdmin(userId: string, admin: boolean): boolean {
  const res = db
    .prepare('UPDATE droits SET admin = ?, updated = ? WHERE user_id = ?')
    .run(admin === true ? 1 : 0, maintenant(), userId);
  return res.changes > 0;
}

/** Marque / démarque le compte comme vérifié. Retourne true si appliqué. */
export function definirVerifie(userId: string, verifie: boolean): boolean {
  const res = db
    .prepare('UPDATE droits SET verifie = ?, updated = ? WHERE user_id = ?')
    .run(verifie === true ? 1 : 0, maintenant(), userId);
  return res.changes > 0;
}

// =====================================================================
// Catalogue (lecture)
// =====================================================================

/** Tous les bars, avec leur première image 'img' dans `image`. */
export function listerBars() {
  return db
    .prepare(
      `SELECT b.*,
              (SELECT bi.fichier FROM bar_image bi
               WHERE bi.bar_id = b.id AND bi.type = 'img'
               ORDER BY bi.position LIMIT 1) AS image
       FROM bar b
       ORDER BY b.created`
    )
    .all();
}

/** Un bar avec `images` (type img), `galerie` et `boissons` [{ id, nom, image }]. */
export function getBar(id: string) {
  const bar: any = db.prepare('SELECT * FROM bar WHERE id = ?').get(id);
  if (!bar) return null;
  const imgs: any[] = db
    .prepare('SELECT type, fichier FROM bar_image WHERE bar_id = ? ORDER BY type, position')
    .all(id);
  bar.images = imgs.filter((i) => i.type === 'img').map((i) => i.fichier);
  bar.galerie = imgs.filter((i) => i.type === 'galerie').map((i) => i.fichier);
  bar.image = bar.images[0] ?? null;
  bar.boissons = db
    .prepare(
      `SELECT bo.id, bo.nom, bo.image
       FROM bar_boisson bb
       JOIN boisson bo ON bo.id = bb.boisson_id
       WHERE bb.bar_id = ?
       ORDER BY bo.nom`
    )
    .all(id);
  return bar;
}

/** Tous les jeux, avec leur première image dans `image`. */
export function listerJeux() {
  return db
    .prepare(
      `SELECT j.*,
              (SELECT ji.fichier FROM jeu_image ji
               WHERE ji.jeu_id = j.id ORDER BY ji.position LIMIT 1) AS image
       FROM jeu j
       ORDER BY j.created`
    )
    .all();
}

/** Un jeu avec `images` (liste ordonnée de clés de fichiers). */
export function getJeu(id: string) {
  const jeu: any = db.prepare('SELECT * FROM jeu WHERE id = ?').get(id);
  if (!jeu) return null;
  jeu.images = db
    .prepare('SELECT fichier FROM jeu_image WHERE jeu_id = ? ORDER BY position')
    .all(id)
    .map((i: any) => i.fichier);
  jeu.image = jeu.images[0] ?? null;
  return jeu;
}

export function listerBoissons() {
  return db.prepare('SELECT * FROM boisson ORDER BY nom').all();
}

/** Articles de la boutique, éventuellement filtrés par type (theme | titre | decoration_avatar). */
export function listerArticles(type?: string) {
  if (type) {
    return db.prepare('SELECT * FROM boutique WHERE type = ? ORDER BY prix, created').all(type);
  }
  return db.prepare('SELECT * FROM boutique ORDER BY type, prix, created').all();
}

export function getArticle(id: string) {
  return db.prepare('SELECT * FROM boutique WHERE id = ?').get(id) ?? null;
}

/** Questions de quiz, éventuellement filtrées par thème (reponse_1..4 en booléens). */
export function listerQuestions(theme?: string) {
  const lignes = theme
    ? db.prepare('SELECT * FROM question_quiz WHERE theme = ? ORDER BY created').all(theme)
    : db.prepare('SELECT * FROM question_quiz ORDER BY created').all();
  return lignes.map((l) => booleens(l, ['reponse_1', 'reponse_2', 'reponse_3', 'reponse_4']));
}

// ===== Profil, amis, favoris, notifications =====

// ===== Sessions de barathon =====

// ===== Boutique et abonnements =====

// ===== Jeux et quiz =====

// ===== Administration =====
