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

// ===== Pages publiques =====

const TABLES_FAVORIS: Record<string, [string, string]> = {
  bar: ['favori_bar', 'bar_id'],
  boisson: ['favori_boisson', 'boisson_id'],
  jeu: ['favori_jeu', 'jeu_id'],
  article: ['favori_article', 'article_id'],
};

/** Ids favoris d'un utilisateur pour un type (bar | boisson | jeu | article). */
export function idsFavoris(userId: string, type: string): Set<string> {
  const t = TABLES_FAVORIS[type];
  if (!t) return new Set();
  const lignes: any[] = db.prepare(`SELECT ${t[1]} AS id FROM ${t[0]} WHERE user_id = ?`).all(userId);
  return new Set(lignes.map((l) => l.id));
}

/** Bars avec `image` (première img) et `galerieImage` (première image de galerie). */
export function listerBarsAvecGalerie() {
  return db
    .prepare(
      `SELECT b.*,
              (SELECT bi.fichier FROM bar_image bi
               WHERE bi.bar_id = b.id AND bi.type = 'img'
               ORDER BY bi.position LIMIT 1) AS image,
              (SELECT bi.fichier FROM bar_image bi
               WHERE bi.bar_id = b.id AND bi.type = 'galerie'
               ORDER BY bi.position LIMIT 1) AS galerieImage
       FROM bar b
       ORDER BY b.created`
    )
    .all();
}

/** Page de jeux (LIMIT/OFFSET) avec `image`, et nombre total de jeux. */
export function listerJeuxPage(limite: number, decalage: number) {
  const total = (db.prepare('SELECT COUNT(*) AS n FROM jeu').get() as any).n as number;
  const jeux = db
    .prepare(
      `SELECT j.*,
              (SELECT ji.fichier FROM jeu_image ji
               WHERE ji.jeu_id = j.id ORDER BY ji.position LIMIT 1) AS image
       FROM jeu j
       ORDER BY j.created
       LIMIT ? OFFSET ?`
    )
    .all(limite, decalage);
  return { jeux, total };
}

// ===== Profil, amis, favoris, notifications =====

// Colonnes retournées pour une liste de personnes : jamais d'e-mail.
// `avatar` et `decoration` sont des clés de fichier (ou null).
const COLONNES_PERSONNE = `p.user_id AS id, p.pseudo, p.prenom, p.nom, p.avatar,
              deco.image AS decoration`;
const JOINTURE_PERSONNE = `JOIN profil p ON p.user_id = %ID%
       LEFT JOIN boutique deco ON deco.id = p.equipe_decoration_id`;

/** Amis de l'utilisateur : [{ id, pseudo, prenom, nom, avatar, decoration }]. */
export function listerAmis(userId: string) {
  return db
    .prepare(
      `SELECT ${COLONNES_PERSONNE}
       FROM ami a ${JOINTURE_PERSONNE.replace('%ID%', 'a.ami_id')}
       WHERE a.user_id = ?
       ORDER BY p.pseudo`
    )
    .all(userId);
}

/** Demandes d'ami reçues (personnes qui m'ont écrit). */
export function listerDemandesRecues(userId: string) {
  return db
    .prepare(
      `SELECT ${COLONNES_PERSONNE}
       FROM demande_ami d ${JOINTURE_PERSONNE.replace('%ID%', 'd.expediteur_id')}
       WHERE d.destinataire_id = ?
       ORDER BY d.created DESC`
    )
    .all(userId);
}

/** Demandes d'ami envoyées par l'utilisateur (en attente). */
export function listerDemandesEnvoyees(userId: string) {
  return db
    .prepare(
      `SELECT ${COLONNES_PERSONNE}
       FROM demande_ami d ${JOINTURE_PERSONNE.replace('%ID%', 'd.destinataire_id')}
       WHERE d.expediteur_id = ?
       ORDER BY d.created DESC`
    )
    .all(userId);
}

/** Relation entre `moi` et `autre` : 'ami' | 'envoyee' | 'recue' | 'aucune'. */
export function etatAmitie(moi: string, autre: string): 'ami' | 'envoyee' | 'recue' | 'aucune' {
  if (db.prepare('SELECT 1 FROM ami WHERE user_id = ? AND ami_id = ?').get(moi, autre)) return 'ami';
  if (db.prepare('SELECT 1 FROM demande_ami WHERE destinataire_id = ? AND expediteur_id = ?').get(autre, moi)) return 'envoyee';
  if (db.prepare('SELECT 1 FROM demande_ami WHERE destinataire_id = ? AND expediteur_id = ?').get(moi, autre)) return 'recue';
  return 'aucune';
}

/** Nombre d'amis d'un utilisateur. */
export function compterAmis(userId: string): number {
  const l: any = db.prepare('SELECT COUNT(*) AS n FROM ami WHERE user_id = ?').get(userId);
  return l?.n ?? 0;
}

// Ajoute les deux lignes ami et supprime les demandes dans les deux sens (à appeler dans une transaction).
function creerAmitie(a: string, b: string): void {
  const date = maintenant();
  db.prepare('INSERT OR IGNORE INTO ami (user_id, ami_id, created) VALUES (?, ?, ?)').run(a, b, date);
  db.prepare('INSERT OR IGNORE INTO ami (user_id, ami_id, created) VALUES (?, ?, ?)').run(b, a, date);
  db.prepare('DELETE FROM demande_ami WHERE (destinataire_id = ? AND expediteur_id = ?) OR (destinataire_id = ? AND expediteur_id = ?)')
    .run(a, b, b, a);
}

/**
 * Envoie une demande d'ami. Si l'autre m'avait déjà écrit, devient ami directement.
 * Retourne 'envoyee' | 'amis' | 'soi' | 'inconnu' | 'deja_amis'.
 */
export function envoyerDemandeAmi(moi: string, autre: string): 'envoyee' | 'amis' | 'soi' | 'inconnu' | 'deja_amis' {
  if (moi === autre) return 'soi';
  if (!db.prepare('SELECT 1 FROM profil WHERE user_id = ?').get(autre)) return 'inconnu';
  if (db.prepare('SELECT 1 FROM ami WHERE user_id = ? AND ami_id = ?').get(moi, autre)) return 'deja_amis';
  return db.transaction(() => {
    if (db.prepare('SELECT 1 FROM demande_ami WHERE destinataire_id = ? AND expediteur_id = ?').get(moi, autre)) {
      creerAmitie(moi, autre);
      return 'amis' as const;
    }
    db.prepare('INSERT OR IGNORE INTO demande_ami (destinataire_id, expediteur_id, created) VALUES (?, ?, ?)')
      .run(autre, moi, maintenant());
    return 'envoyee' as const;
  })();
}

/** Accepte la demande reçue de `ami`. Retourne false s'il n'y a pas de demande. */
export function accepterDemandeAmi(moi: string, ami: string): boolean {
  return db.transaction(() => {
    if (!db.prepare('SELECT 1 FROM demande_ami WHERE destinataire_id = ? AND expediteur_id = ?').get(moi, ami)) return false;
    creerAmitie(moi, ami);
    return true;
  })();
}

/** Refuse (supprime) la demande reçue de `ami`. */
export function refuserDemandeAmi(moi: string, ami: string): boolean {
  return db.prepare('DELETE FROM demande_ami WHERE destinataire_id = ? AND expediteur_id = ?').run(moi, ami).changes > 0;
}

/** Supprime l'amitié dans les deux sens (et toute demande en attente entre eux). */
export function supprimerAmi(moi: string, ami: string): boolean {
  return db.transaction(() => {
    const n = db.prepare('DELETE FROM ami WHERE (user_id = ? AND ami_id = ?) OR (user_id = ? AND ami_id = ?)')
      .run(moi, ami, ami, moi).changes;
    return n > 0;
  })();
}

/** Recherche de personnes par pseudo (LIKE échappé), 20 max, moi exclu. Jamais d'e-mail. */
export function rechercherUtilisateurs(moi: string, q: string) {
  const motif = '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%';
  return db
    .prepare(
      `SELECT p.user_id AS id, p.pseudo, p.avatar, deco.image AS decoration
       FROM profil p
       LEFT JOIN boutique deco ON deco.id = p.equipe_decoration_id
       WHERE p.user_id <> ? AND p.pseudo LIKE ? ESCAPE '\\'
       ORDER BY p.pseudo
       LIMIT 20`
    )
    .all(moi, motif);
}

// Liste blanche FIXE : type de favori -> table, colonne de la cible et table cible.
// Aucun nom de table ou de colonne ne vient du client.
const FAVORIS: Record<string, { table: string; colonne: string; cible: string }> = {
  bar: { table: 'favori_bar', colonne: 'bar_id', cible: 'bar' },
  boisson: { table: 'favori_boisson', colonne: 'boisson_id', cible: 'boisson' },
  jeu: { table: 'favori_jeu', colonne: 'jeu_id', cible: 'jeu' },
  article: { table: 'favori_article', colonne: 'article_id', cible: 'boutique' },
};

export function typeFavoriValide(type: unknown): boolean {
  return typeof type === 'string' && Object.prototype.hasOwnProperty.call(FAVORIS, type);
}

/** true si la cible est dans les favoris de l'utilisateur. */
export function estFavori(userId: string, type: string, id: string): boolean {
  if (!typeFavoriValide(type)) return false;
  const f = FAVORIS[type];
  return !!db.prepare(`SELECT 1 FROM ${f.table} WHERE user_id = ? AND ${f.colonne} = ?`).get(userId, id);
}

/** Identifiants favoris d'un utilisateur pour un type. */
export function listerFavorisIds(userId: string, type: string): string[] {
  if (!typeFavoriValide(type)) return [];
  const f = FAVORIS[type];
  return db
    .prepare(`SELECT ${f.colonne} AS id FROM ${f.table} WHERE user_id = ?`)
    .all(userId)
    .map((l: any) => l.id);
}

/**
 * Bascule un favori. Retourne { favori: boolean } ou null si le type est
 * invalide ou si la cible n'existe pas.
 */
export function basculerFavori(userId: string, type: string, id: string): { favori: boolean } | null {
  if (!typeFavoriValide(type) || typeof id !== 'string' || id === '') return null;
  const f = FAVORIS[type];
  if (!db.prepare(`SELECT 1 FROM ${f.cible} WHERE id = ?`).get(id)) return null;
  return db.transaction(() => {
    const supprime = db.prepare(`DELETE FROM ${f.table} WHERE user_id = ? AND ${f.colonne} = ?`).run(userId, id).changes;
    if (supprime > 0) return { favori: false };
    db.prepare(`INSERT INTO ${f.table} (user_id, ${f.colonne}) VALUES (?, ?)`).run(userId, id);
    return { favori: true };
  })();
}

/** Notifications : non lues + les plus récentes (20 max). */
export function listerNotifications(userId: string) {
  return db
    .prepare(
      `SELECT id, texte, lu, created FROM notification
       WHERE user_id = ?
       ORDER BY created DESC LIMIT 20`
    )
    .all(userId)
    .map((l) => booleens(l, ['lu']));
}

/** Nombre de notifications non lues. */
export function compterNotificationsNonLues(userId: string): number {
  const l: any = db.prepare('SELECT COUNT(*) AS n FROM notification WHERE user_id = ? AND lu = 0').get(userId);
  return l?.n ?? 0;
}

/** Marque lue(s) : une notification (id) ou toutes (sans id), uniquement celles de l'utilisateur. */
export function marquerNotificationsLues(userId: string, id?: string | null): number {
  if (id) {
    return db.prepare('UPDATE notification SET lu = 1 WHERE id = ? AND user_id = ?').run(id, userId).changes;
  }
  return db.prepare('UPDATE notification SET lu = 1 WHERE user_id = ? AND lu = 0').run(userId).changes;
}

/** Invitations de session en attente : [{ session_id, nom, hote_pseudo }]. */
export function listerInvitationsSession(userId: string) {
  return db
    .prepare(
      `SELECT i.session_id, s.nom, hp.pseudo AS hote_pseudo
       FROM invitation_session i
       JOIN session_barathon s ON s.id = i.session_id
       LEFT JOIN profil hp ON hp.user_id = s.hote_id
       WHERE i.user_id = ?
       ORDER BY i.created DESC`
    )
    .all(userId);
}

/** Répond à une invitation : supprime l'invitation et, si acceptée, ajoute le membre. false si aucune invitation. */
export function repondreInvitationSession(userId: string, sessionId: string, accepter: boolean): boolean {
  return db.transaction(() => {
    const n = db.prepare('DELETE FROM invitation_session WHERE session_id = ? AND user_id = ?').run(sessionId, userId).changes;
    if (n === 0) return false;
    if (accepter) {
      db.prepare('INSERT OR IGNORE INTO session_membre (session_id, user_id) VALUES (?, ?)').run(sessionId, userId);
    }
    return true;
  })();
}

/** Favoris publics d'un utilisateur : bars, jeux, boissons (avec image = clé de fichier). */
export function getFavorisPublics(userId: string) {
  const bars = db
    .prepare(
      `SELECT b.id, b.nom,
              (SELECT bi.fichier FROM bar_image bi WHERE bi.bar_id = b.id AND bi.type = 'img'
               ORDER BY bi.position LIMIT 1) AS image
       FROM favori_bar f JOIN bar b ON b.id = f.bar_id
       WHERE f.user_id = ? ORDER BY b.nom`
    )
    .all(userId);
  const jeux = db
    .prepare(
      `SELECT j.id, j.nom,
              (SELECT ji.fichier FROM jeu_image ji WHERE ji.jeu_id = j.id ORDER BY ji.position LIMIT 1) AS image
       FROM favori_jeu f JOIN jeu j ON j.id = f.jeu_id
       WHERE f.user_id = ? ORDER BY j.nom`
    )
    .all(userId);
  const boissons = db
    .prepare(
      `SELECT bo.id, bo.nom, bo.image
       FROM favori_boisson f JOIN boisson bo ON bo.id = f.boisson_id
       WHERE f.user_id = ? ORDER BY bo.nom`
    )
    .all(userId);
  return { bars, jeux, boissons };
}

/** Date de création du compte (ISO) ou null. */
export function getDateCreationProfil(userId: string): string | null {
  const l: any = db.prepare('SELECT created FROM profil WHERE user_id = ?').get(userId);
  return l?.created ?? null;
}

// ===== Profil : page Mon profil =====

/** Utilisateurs (hors soi-même) proposés dans la recherche d'amis : champs publics seulement. */
export function listerUtilisateursPourAmis(userId: string, limite = 200) {
  return db
    .prepare(
      `SELECT user_id AS id, COALESCE(pseudo, '') AS pseudo, COALESCE(prenom, '') AS prenom,
              COALESCE(nom, '') AS nom, avatar
       FROM profil
       WHERE user_id <> ?
       ORDER BY pseudo
       LIMIT ?`
    )
    .all(userId, limite);
}

/**
 * Tout ce que la page "Mon profil" affiche : profil, droits, articles équipés
 * et possédés (par type), favoris, amis, demandes reçues, invitations de
 * session, notifications et compteurs. Retourne null si le profil n'existe pas.
 */
export function getMonProfilComplet(userId: string) {
  const base: any = getProfil(userId);
  if (!base) return null;
  const droits: any = getDroits(userId) ?? { admin: false, points: 0, abonnement: 'Gratuit', verifie: false };
  const createdUser: any = db.prepare('SELECT createdAt FROM "user" WHERE id = ?').get(userId);

  const article = (id: string | null) =>
    id ? (db.prepare('SELECT id, nom, type, image, titre FROM boutique WHERE id = ?').get(id) ?? null) : null;

  const equipes = {
    decoration: article(base.equipe_decoration_id),
    titre: article(base.equipe_titre_id),
    theme: article(base.equipe_theme_id),
  };

  const possedesTous: any[] = db
    .prepare(
      `SELECT b.id, b.nom, b.type, b.image, b.titre
       FROM possession p JOIN boutique b ON b.id = p.article_id
       WHERE p.user_id = ?
       ORDER BY b.type, b.nom`
    )
    .all(userId);
  const possedes = {
    decoration_avatar: possedesTous.filter((a) => a.type === 'decoration_avatar'),
    titre: possedesTous.filter((a) => a.type === 'titre'),
    theme: possedesTous.filter((a) => a.type === 'theme'),
  };

  const favoris = {
    bars: db
      .prepare(
        `SELECT b.id, b.nom,
                (SELECT bi.fichier FROM bar_image bi
                 WHERE bi.bar_id = b.id AND bi.type = 'img'
                 ORDER BY bi.position LIMIT 1) AS image
         FROM favori_bar f JOIN bar b ON b.id = f.bar_id
         WHERE f.user_id = ? ORDER BY b.nom`
      )
      .all(userId),
    jeux: db
      .prepare(
        `SELECT j.id, j.nom,
                (SELECT ji.fichier FROM jeu_image ji
                 WHERE ji.jeu_id = j.id ORDER BY ji.position LIMIT 1) AS image
         FROM favori_jeu f JOIN jeu j ON j.id = f.jeu_id
         WHERE f.user_id = ? ORDER BY j.nom`
      )
      .all(userId),
    boissons: db
      .prepare(
        `SELECT bo.id, bo.nom, bo.image
         FROM favori_boisson f JOIN boisson bo ON bo.id = f.boisson_id
         WHERE f.user_id = ? ORDER BY bo.nom`
      )
      .all(userId),
    articles: db
      .prepare(
        `SELECT b.id, b.nom, b.type, b.image, b.titre
         FROM favori_article f JOIN boutique b ON b.id = f.article_id
         WHERE f.user_id = ? ORDER BY b.type, b.nom`
      )
      .all(userId),
  };

  const ligneAmi = (l: any) => ({
    id: l.id,
    pseudo: l.pseudo ?? '',
    prenom: l.prenom ?? '',
    nom: l.nom ?? '',
    avatar: l.avatar ?? null,
    abonnement: l.abonnement ?? 'Gratuit',
    decoration: l.deco_image ?? null,
  });
  const colonnesAmi = `p.user_id AS id, p.pseudo, p.prenom, p.nom, p.avatar,
                       d.abonnement, deco.image AS deco_image`;
  const jointuresAmi = `JOIN profil p ON p.user_id = %ID%
                       LEFT JOIN droits d ON d.user_id = p.user_id
                       LEFT JOIN boutique deco ON deco.id = p.equipe_decoration_id`;

  const amis = db
    .prepare(
      `SELECT ${colonnesAmi}
       FROM ami a ${jointuresAmi.replace('%ID%', 'a.ami_id')}
       WHERE a.user_id = ? ORDER BY p.pseudo`
    )
    .all(userId)
    .map(ligneAmi);

  const demandesAmis = db
    .prepare(
      `SELECT ${colonnesAmi}
       FROM demande_ami da ${jointuresAmi.replace('%ID%', 'da.expediteur_id')}
       WHERE da.destinataire_id = ? ORDER BY da.created DESC`
    )
    .all(userId)
    .map(ligneAmi);

  const invitations = db
    .prepare(
      `SELECT s.id, s.nom, s.date_depart, s.hote_id
       FROM invitation_session i JOIN session_barathon s ON s.id = i.session_id
       WHERE i.user_id = ? ORDER BY i.created DESC`
    )
    .all(userId)
    .map((s: any) => ({
      id: s.id,
      nom: s.nom || 'Session sans nom',
      date: s.date_depart ? String(s.date_depart).slice(0, 10) : null,
      hote_id: s.hote_id,
    }));

  const notifications = db
    .prepare('SELECT id, texte, lu, created FROM notification WHERE user_id = ? ORDER BY created DESC LIMIT 50')
    .all(userId)
    .map((n: any) => booleens(n, ['lu']));

  const compte = (sql: string) => (db.prepare(sql).get(userId) as any).n as number;

  return {
    ...base,
    ...droits,
    cree_le: createdUser?.createdAt ?? base.created,
    equipes,
    possedes,
    favoris,
    amis,
    demandes_amis: demandesAmis,
    invitations,
    notifications,
    barathon_organiser: compte('SELECT COUNT(*) AS n FROM session_barathon WHERE hote_id = ?'),
    barathon_participer: compte('SELECT COUNT(*) AS n FROM session_membre WHERE user_id = ?'),
    bars_decouverts: compte('SELECT COUNT(*) AS n FROM bar_decouvert WHERE user_id = ?'),
    total_bars: (db.prepare('SELECT COUNT(*) AS n FROM bar').get() as any).n as number,
  };
}

/** Clé de l'avatar actuel (ou null). */
export function getAvatarProfil(userId: string): string | null {
  const l: any = db.prepare('SELECT avatar FROM profil WHERE user_id = ?').get(userId);
  return l?.avatar ?? null;
}

/** Change l'e-mail du compte. Retourne false si l'adresse est déjà prise ou invalide. */
export function changerEmail(userId: string, email: string): boolean {
  const adresse = String(email ?? '').trim().toLowerCase();
  if (adresse.length < 5 || adresse.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adresse)) return false;
  const pris: any = db.prepare('SELECT id FROM "user" WHERE lower(email) = ? AND id <> ?').get(adresse, userId);
  if (pris) return false;
  const res = db
    .prepare('UPDATE "user" SET email = ?, updatedAt = ? WHERE id = ?')
    .run(adresse, maintenant(), userId);
  return res.changes > 0;
}

/**
 * Supprime le compte (les ON DELETE CASCADE nettoient profil, droits,
 * sessions, amis, favoris, etc.). Retourne la clé de l'ancien avatar
 * (à supprimer du stockage par l'appelant) ou null.
 */
export function supprimerCompte(userId: string): { supprime: boolean; avatar: string | null } {
  const avatar = getAvatarProfil(userId);
  const res = db.prepare('DELETE FROM "user" WHERE id = ?').run(userId);
  return { supprime: res.changes > 0, avatar };
}

// ===== Sessions de barathon =====

// Colonne bar_actuel ajoutée après coup : migration douce des bases existantes
// (schema.sql ne l'ajoute qu'aux nouvelles bases).
{
  const colonnesSession = db.pragma('table_info(session_barathon)') as any[];
  if (!colonnesSession.some((c) => c.name === 'bar_actuel')) {
    db.exec('ALTER TABLE session_barathon ADD COLUMN bar_actuel INTEGER NOT NULL DEFAULT 0 CHECK (bar_actuel >= 0)');
  }
}

// Points de fin de session : montants FIXES décidés par le serveur.
const POINTS_PAR_BAR = 5;
const POINTS_BONUS_SAM = 50;
const POINTS_BONUS_HOTE = 30;
const MULTIPLICATEUR_ABONNEMENT: Record<string, number> = { Gratuit: 1, VIP: 2, Premium: 5 };

const MAX_BARS_SESSION = 50;
const MAX_INVITES_SESSION = 100;

/**
 * Normalise une date de session en 'AAAA-MM-JJTHH:MM:SS' (heure locale "murale",
 * sans fuseau). null si vide, undefined si invalide.
 */
export function normaliserDateSession(v: any): string | null | undefined {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string') return undefined;
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(v.trim());
  if (!m) return undefined;
  if (Number.isNaN(new Date(`${m[1]}T${m[2]}:${m[3]}:00`).getTime())) return undefined;
  return `${m[1]}T${m[2]}:${m[3]}:${m[4] ?? '00'}`;
}

/** Découpe une date de session (ancien ou nouveau format) en { date: 'AAAA-MM-JJ', heure: 'HH:MM' }. */
export function decouperDateSession(v: any): { date: string; heure: string } {
  if (typeof v !== 'string' || v.length < 10) return { date: '', heure: '' };
  return { date: v.slice(0, 10), heure: v.length >= 16 ? v.slice(11, 16) : '' };
}

function dateSessionAtteinte(v: any): boolean {
  if (typeof v !== 'string' || v.length < 16) return false;
  const d = new Date(v.slice(0, 19));
  return !Number.isNaN(d.getTime()) && Date.now() >= d.getTime();
}

function listeIds(v: any, max: number): string[] | null {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > max) return null;
  if (!v.every((x) => typeof x === 'string' && x.length > 0 && x.length <= 40)) return null;
  return [...new Set(v as string[])];
}

const SQL_PREMIERE_IMAGE_BAR =
  `(SELECT bi.fichier FROM bar_image bi WHERE bi.bar_id = b.id AND bi.type = 'img' ORDER BY bi.position LIMIT 1)`;

/** Session brute (automatique en booléen) ou null. */
export function getSessionBrute(id: string) {
  const s: any = db.prepare('SELECT * FROM session_barathon WHERE id = ?').get(id);
  return s ? booleens(s, ['automatique']) : null;
}

/**
 * Rôle d'un utilisateur dans une session : { session, hote, membre, invite, sam, acces }
 * (acces = hôte, membre ou invité), ou null si la session n'existe pas.
 */
export function getRoleSession(sessionId: string, userId: string) {
  const session = getSessionBrute(sessionId);
  if (!session) return null;
  const hote = session.hote_id === userId;
  const membre = !!db.prepare('SELECT 1 FROM session_membre WHERE session_id = ? AND user_id = ?').get(sessionId, userId);
  const invite = !!db.prepare('SELECT 1 FROM invitation_session WHERE session_id = ? AND user_id = ?').get(sessionId, userId);
  const sam = !!db.prepare('SELECT 1 FROM session_sam WHERE session_id = ? AND user_id = ?').get(sessionId, userId);
  return { session, hote, membre, invite, sam, acces: hote || membre || invite };
}

/** Sessions non terminées dont l'utilisateur est hôte ou membre. */
export function listerSessionsUtilisateur(userId: string) {
  const lignes: any[] = db
    .prepare(
      `SELECT s.id, s.nom, s.date_depart, s.etat, s.hote_id,
              (SELECT COUNT(*) FROM session_bar sb WHERE sb.session_id = s.id) AS nb_bars,
              (SELECT COUNT(*) FROM session_membre sm WHERE sm.session_id = s.id) AS nb_membres,
              (SELECT bi.fichier FROM bar_image bi
               WHERE bi.type = 'img'
                 AND bi.bar_id = (SELECT sb.bar_id FROM session_bar sb WHERE sb.session_id = s.id ORDER BY sb.position LIMIT 1)
               ORDER BY bi.position LIMIT 1) AS image_bar
       FROM session_barathon s
       WHERE s.etat <> 'fini'
         AND (s.hote_id = ? OR EXISTS (SELECT 1 FROM session_membre m WHERE m.session_id = s.id AND m.user_id = ?))
       ORDER BY s.created DESC`
    )
    .all(userId, userId);
  return lignes.map((l) => ({ ...l, est_hote: l.hote_id === userId }));
}

/** Détail d'une session : session + bars (ordonnés), jeu, membres, samIds, invitesIds. */
export function getDetailSession(id: string) {
  const session = getSessionBrute(id);
  if (!session) return null;
  const bars = db
    .prepare(
      `SELECT b.id, b.nom, b.adresse, b.latitude, b.longitude, ${SQL_PREMIERE_IMAGE_BAR} AS image
       FROM session_bar sb JOIN bar b ON b.id = sb.bar_id
       WHERE sb.session_id = ? ORDER BY sb.position`
    )
    .all(id);
  const jeu = session.jeu_id
    ? db
        .prepare(
          `SELECT j.id, j.nom, j.description, j.type,
                  (SELECT ji.fichier FROM jeu_image ji WHERE ji.jeu_id = j.id ORDER BY ji.position LIMIT 1) AS image
           FROM jeu j WHERE j.id = ?`
        )
        .get(session.jeu_id) ?? null
    : null;
  const membres = db
    .prepare(
      `SELECT p.user_id AS id, p.pseudo, p.prenom, p.nom, p.avatar
       FROM session_membre m JOIN profil p ON p.user_id = m.user_id
       WHERE m.session_id = ? ORDER BY p.pseudo`
    )
    .all(id);
  const samIds = (db.prepare('SELECT user_id FROM session_sam WHERE session_id = ?').all(id) as any[]).map((r) => r.user_id);
  const invitesIds = (db.prepare('SELECT user_id FROM invitation_session WHERE session_id = ?').all(id) as any[]).map((r) => r.user_id);
  return { session, bars, jeu, membres, samIds, invitesIds };
}

/** Amis d'un utilisateur (profil public minimal) pour inviter à une session. */
export function listerAmisPourSession(userId: string) {
  return db
    .prepare(
      `SELECT p.user_id AS id, p.pseudo, p.prenom, p.nom, p.avatar
       FROM ami a JOIN profil p ON p.user_id = a.ami_id
       WHERE a.user_id = ? ORDER BY p.pseudo`
    )
    .all(userId);
}

/** Tous les bars (id, nom, adresse, coordonnées, image) pour le choix de parcours. */
export function listerBarsPourSession() {
  return db
    .prepare(
      `SELECT b.id, b.nom, b.adresse, b.latitude, b.longitude, ${SQL_PREMIERE_IMAGE_BAR} AS image
       FROM bar b ORDER BY b.nom`
    )
    .all();
}

/** Tous les jeux (id, nom, description, type, image) pour le choix du jeu. */
export function listerJeuxPourSession() {
  return db
    .prepare(
      `SELECT j.id, j.nom, j.description, j.type,
              (SELECT ji.fichier FROM jeu_image ji WHERE ji.jeu_id = j.id ORDER BY ji.position LIMIT 1) AS image
       FROM jeu j ORDER BY j.nom`
    )
    .all();
}

/** Ids des bars favoris d'un utilisateur. */
export function listerBarsFavorisIds(userId: string): string[] {
  return (db.prepare('SELECT bar_id FROM favori_bar WHERE user_id = ?').all(userId) as any[]).map((r) => r.bar_id);
}

type ResultatSession<T = {}> = ({ ok: true } & T) | { ok: false; erreur: string; status: number };

function barsExistent(ids: string[]): boolean {
  const q = db.prepare('SELECT 1 FROM bar WHERE id = ?');
  return ids.every((id) => !!q.get(id));
}

function sontAmis(hoteId: string, ids: string[]): boolean {
  const q = db.prepare('SELECT 1 FROM ami WHERE user_id = ? AND ami_id = ?');
  return ids.every((id) => !!q.get(hoteId, id));
}

/**
 * Crée une session. L'hôte est TOUJOURS hoteId ; les invités doivent être des
 * amis de l'hôte ; les SAM doivent être l'hôte ou des invités.
 */
export function creerSession(
  hoteId: string,
  d: {
    nom?: any; description?: any; date_depart?: any; date_arrivee?: any;
    automatique?: any; bars?: any; jeu_id?: any; invites?: any; sam?: any;
  }
): ResultatSession<{ id: string }> {
  const nom = typeof d.nom === 'string' ? d.nom.trim().slice(0, 100) : '';
  if (!nom) return { ok: false, erreur: 'Veuillez donner un nom au barathon.', status: 400 };
  const description =
    typeof d.description === 'string' && d.description.trim() ? d.description.trim().slice(0, 2000) : null;
  const dateDepart = normaliserDateSession(d.date_depart);
  const dateArrivee = normaliserDateSession(d.date_arrivee);
  if (dateDepart === undefined || dateArrivee === undefined) {
    return { ok: false, erreur: 'Date invalide.', status: 400 };
  }
  const bars = listeIds(d.bars, MAX_BARS_SESSION);
  const invites = listeIds(d.invites, MAX_INVITES_SESSION);
  const sam = listeIds(d.sam, MAX_INVITES_SESSION);
  if (!bars || !invites || !sam) return { ok: false, erreur: 'Requête invalide.', status: 400 };
  if (!barsExistent(bars)) return { ok: false, erreur: 'Bar introuvable.', status: 400 };
  let jeuId: string | null = null;
  if (d.jeu_id !== null && d.jeu_id !== undefined && d.jeu_id !== '') {
    if (typeof d.jeu_id !== 'string' || !db.prepare('SELECT 1 FROM jeu WHERE id = ?').get(d.jeu_id)) {
      return { ok: false, erreur: 'Jeu introuvable.', status: 400 };
    }
    jeuId = d.jeu_id;
  }
  if (invites.includes(hoteId) || !sontAmis(hoteId, invites)) {
    return { ok: false, erreur: 'Vous ne pouvez inviter que vos amis.', status: 400 };
  }
  if (!sam.every((id) => id === hoteId || invites.includes(id))) {
    return { ok: false, erreur: 'Un SAM doit être l\'hôte ou un invité.', status: 400 };
  }

  const id = nouvelId();
  const now = maintenant();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO session_barathon (id, nom, description, date_depart, date_arrivee, etat, automatique, hote_id, jeu_id, bar_actuel, created, updated)
       VALUES (?, ?, ?, ?, ?, 'pas_commencer', ?, ?, ?, 0, ?, ?)`
    ).run(id, nom, description, dateDepart, dateArrivee, d.automatique === true ? 1 : 0, hoteId, jeuId, now, now);
    const insBar = db.prepare('INSERT INTO session_bar (session_id, bar_id, position) VALUES (?, ?, ?)');
    bars.forEach((b, i) => insBar.run(id, b, i));
    const insInv = db.prepare('INSERT INTO invitation_session (session_id, user_id, created) VALUES (?, ?, ?)');
    invites.forEach((u) => insInv.run(id, u, now));
    const insSam = db.prepare('INSERT INTO session_sam (session_id, user_id) VALUES (?, ?)');
    sam.forEach((u) => insSam.run(id, u));
  })();
  return { ok: true, id };
}

/** Modifie nom, dates, description, lancement automatique (session non terminée). */
export function modifierParametresSession(
  sessionId: string,
  d: { nom?: any; description?: any; date_depart?: any; date_arrivee?: any; automatique?: any }
): ResultatSession {
  const nom = typeof d.nom === 'string' ? d.nom.trim().slice(0, 100) : '';
  if (!nom) return { ok: false, erreur: 'Le nom est obligatoire.', status: 400 };
  const description =
    typeof d.description === 'string' && d.description.trim() ? d.description.trim().slice(0, 2000) : null;
  const dateDepart = normaliserDateSession(d.date_depart);
  const dateArrivee = normaliserDateSession(d.date_arrivee);
  if (dateDepart === undefined || dateArrivee === undefined) {
    return { ok: false, erreur: 'Date invalide.', status: 400 };
  }
  const res = db
    .prepare(
      `UPDATE session_barathon
       SET nom = ?, description = ?, date_depart = ?, date_arrivee = ?, automatique = ?, updated = ?
       WHERE id = ? AND etat <> 'fini'`
    )
    .run(nom, description, dateDepart, dateArrivee, d.automatique === true ? 1 : 0, maintenant(), sessionId);
  return res.changes > 0 ? { ok: true } : { ok: false, erreur: 'Session introuvable ou terminée.', status: 404 };
}

/** Remplace la liste (ordonnée) des bars. Uniquement avant le lancement. */
export function definirBarsSession(sessionId: string, brut: any): ResultatSession {
  const bars = listeIds(brut, MAX_BARS_SESSION);
  if (!bars) return { ok: false, erreur: 'Requête invalide.', status: 400 };
  if (!barsExistent(bars)) return { ok: false, erreur: 'Bar introuvable.', status: 400 };
  return db.transaction((): ResultatSession => {
    const maj = db
      .prepare(`UPDATE session_barathon SET bar_actuel = 0, updated = ? WHERE id = ? AND etat = 'pas_commencer'`)
      .run(maintenant(), sessionId);
    if (maj.changes === 0) return { ok: false, erreur: 'Les bars ne sont modifiables qu\'avant le lancement.', status: 409 };
    db.prepare('DELETE FROM session_bar WHERE session_id = ?').run(sessionId);
    const ins = db.prepare('INSERT INTO session_bar (session_id, bar_id, position) VALUES (?, ?, ?)');
    bars.forEach((b, i) => ins.run(sessionId, b, i));
    return { ok: true };
  })();
}

/** Choisit (ou retire, avec null) le jeu de la session. */
export function definirJeuSession(sessionId: string, jeuId: any): ResultatSession {
  let valeur: string | null = null;
  if (jeuId !== null && jeuId !== undefined && jeuId !== '') {
    if (typeof jeuId !== 'string' || !db.prepare('SELECT 1 FROM jeu WHERE id = ?').get(jeuId)) {
      return { ok: false, erreur: 'Jeu introuvable.', status: 400 };
    }
    valeur = jeuId;
  }
  const res = db
    .prepare(`UPDATE session_barathon SET jeu_id = ?, updated = ? WHERE id = ? AND etat <> 'fini'`)
    .run(valeur, maintenant(), sessionId);
  return res.changes > 0 ? { ok: true } : { ok: false, erreur: 'Session introuvable ou terminée.', status: 404 };
}

/** Invite un ami de l'hôte (invitation en attente ; éventuellement désigné SAM). */
export function inviterSession(sessionId: string, hoteId: string, userId: any, sam: boolean): ResultatSession {
  if (typeof userId !== 'string' || userId === hoteId) return { ok: false, erreur: 'Utilisateur invalide.', status: 400 };
  if (!sontAmis(hoteId, [userId])) return { ok: false, erreur: 'Vous ne pouvez inviter que vos amis.', status: 400 };
  return db.transaction((): ResultatSession => {
    const s: any = db.prepare('SELECT etat FROM session_barathon WHERE id = ?').get(sessionId);
    if (!s || s.etat === 'fini') return { ok: false, erreur: 'Session introuvable ou terminée.', status: 404 };
    const membre = db.prepare('SELECT 1 FROM session_membre WHERE session_id = ? AND user_id = ?').get(sessionId, userId);
    if (!membre) {
      db.prepare('INSERT OR IGNORE INTO invitation_session (session_id, user_id, created) VALUES (?, ?, ?)')
        .run(sessionId, userId, maintenant());
    }
    if (sam) db.prepare('INSERT OR IGNORE INTO session_sam (session_id, user_id) VALUES (?, ?)').run(sessionId, userId);
    return { ok: true };
  })();
}

/** Retire un membre (ou annule une invitation) : supprime aussi son rôle SAM. L'hôte ne peut pas être retiré. */
export function retirerParticipantSession(sessionId: string, userId: string): ResultatSession {
  return db.transaction((): ResultatSession => {
    const s: any = db.prepare('SELECT hote_id FROM session_barathon WHERE id = ?').get(sessionId);
    if (!s) return { ok: false, erreur: 'Session introuvable.', status: 404 };
    if (s.hote_id === userId) return { ok: false, erreur: 'L\'hôte ne peut pas être retiré.', status: 400 };
    const a = db.prepare('DELETE FROM session_membre WHERE session_id = ? AND user_id = ?').run(sessionId, userId).changes;
    const b = db.prepare('DELETE FROM invitation_session WHERE session_id = ? AND user_id = ?').run(sessionId, userId).changes;
    db.prepare('DELETE FROM session_sam WHERE session_id = ? AND user_id = ?').run(sessionId, userId);
    return a + b > 0 ? { ok: true } : { ok: false, erreur: 'Participant introuvable.', status: 404 };
  })();
}

/** Désigne / retire un SAM : l'hôte, un membre ou un invité de la session. */
export function definirSamSession(sessionId: string, userId: any, sam: boolean): ResultatSession {
  if (typeof userId !== 'string') return { ok: false, erreur: 'Utilisateur invalide.', status: 400 };
  return db.transaction((): ResultatSession => {
    const s: any = db.prepare('SELECT hote_id, etat FROM session_barathon WHERE id = ?').get(sessionId);
    if (!s || s.etat === 'fini') return { ok: false, erreur: 'Session introuvable ou terminée.', status: 404 };
    if (!sam) {
      db.prepare('DELETE FROM session_sam WHERE session_id = ? AND user_id = ?').run(sessionId, userId);
      return { ok: true };
    }
    const concerne =
      s.hote_id === userId ||
      db.prepare('SELECT 1 FROM session_membre WHERE session_id = ? AND user_id = ?').get(sessionId, userId) ||
      db.prepare('SELECT 1 FROM invitation_session WHERE session_id = ? AND user_id = ?').get(sessionId, userId);
    if (!concerne) return { ok: false, erreur: 'Le SAM doit participer à la session.', status: 400 };
    db.prepare('INSERT OR IGNORE INTO session_sam (session_id, user_id) VALUES (?, ?)').run(sessionId, userId);
    return { ok: true };
  })();
}

/** Accepte une invitation : supprime l'invitation et ajoute l'utilisateur aux membres (transaction). */
export function rejoindreSession(sessionId: string, userId: string): ResultatSession {
  return db.transaction((): ResultatSession => {
    const s: any = db.prepare('SELECT etat FROM session_barathon WHERE id = ?').get(sessionId);
    if (!s) return { ok: false, erreur: 'Session introuvable.', status: 404 };
    const supprimee = db
      .prepare('DELETE FROM invitation_session WHERE session_id = ? AND user_id = ?')
      .run(sessionId, userId).changes;
    if (supprimee === 0) return { ok: false, erreur: 'Aucune invitation pour cette session.', status: 404 };
    if (s.etat === 'fini') return { ok: false, erreur: 'Cette session est terminée.', status: 409 };
    db.prepare('INSERT OR IGNORE INTO session_membre (session_id, user_id) VALUES (?, ?)').run(sessionId, userId);
    return { ok: true };
  })();
}

/** Refuse une invitation (supprime l'invitation et un éventuel rôle SAM en attente). */
export function refuserInvitationSession(sessionId: string, userId: string): ResultatSession {
  return db.transaction((): ResultatSession => {
    const n = db.prepare('DELETE FROM invitation_session WHERE session_id = ? AND user_id = ?').run(sessionId, userId).changes;
    if (n === 0) return { ok: false, erreur: 'Aucune invitation pour cette session.', status: 404 };
    const membre = db.prepare('SELECT 1 FROM session_membre WHERE session_id = ? AND user_id = ?').get(sessionId, userId);
    if (!membre) db.prepare('DELETE FROM session_sam WHERE session_id = ? AND user_id = ?').run(sessionId, userId);
    return { ok: true };
  })();
}

/** Quitter une session : réservé à un membre qui n'est pas l'hôte. */
export function quitterSession(sessionId: string, userId: string): ResultatSession {
  return db.transaction((): ResultatSession => {
    const s: any = db.prepare('SELECT hote_id FROM session_barathon WHERE id = ?').get(sessionId);
    if (!s || s.hote_id === userId) return { ok: false, erreur: 'Impossible de quitter cette session.', status: 400 };
    const n = db.prepare('DELETE FROM session_membre WHERE session_id = ? AND user_id = ?').run(sessionId, userId).changes;
    if (n === 0) return { ok: false, erreur: 'Vous n\'êtes pas membre de cette session.', status: 404 };
    db.prepare('DELETE FROM session_sam WHERE session_id = ? AND user_id = ?').run(sessionId, userId);
    return { ok: true };
  })();
}

/** Supprime la session (cascade : bars, membres, SAM, invitations). */
export function supprimerSession(sessionId: string): boolean {
  return db.prepare('DELETE FROM session_barathon WHERE id = ?').run(sessionId).changes > 0;
}

/** pas_commencer -> en_cours (au moins un SAM requis, sauf lancement automatique). */
export function demarrerSession(sessionId: string, { exigerSam = true } = {}): ResultatSession {
  return db.transaction((): ResultatSession => {
    if (exigerSam) {
      const n: any = db.prepare('SELECT COUNT(*) AS n FROM session_sam WHERE session_id = ?').get(sessionId);
      if (n.n === 0) return { ok: false, erreur: 'Ajoutez au moins un SAM avant de lancer la session.', status: 400 };
    }
    const res = db
      .prepare(`UPDATE session_barathon SET etat = 'en_cours', bar_actuel = 0, updated = ? WHERE id = ? AND etat = 'pas_commencer'`)
      .run(maintenant(), sessionId);
    return res.changes > 0 ? { ok: true } : { ok: false, erreur: 'La session ne peut pas être lancée.', status: 409 };
  })();
}

/** Passe au bar suivant (session en cours, sans dépasser le dernier bar). Retourne le nouvel index ou null. */
export function barSuivantSession(sessionId: string): number | null {
  const res = db
    .prepare(
      `UPDATE session_barathon SET bar_actuel = bar_actuel + 1, updated = ?
       WHERE id = ? AND etat = 'en_cours'
         AND bar_actuel + 1 < (SELECT COUNT(*) FROM session_bar WHERE session_id = ?)`
    )
    .run(maintenant(), sessionId, sessionId);
  if (res.changes === 0) return null;
  const l: any = db.prepare('SELECT bar_actuel FROM session_barathon WHERE id = ?').get(sessionId);
  return l ? l.bar_actuel : null;
}

export type GainSession = {
  user_id: string; base: number; total: number; abonnement: string; multiplicateur: number; bars_visites: number;
};

/**
 * en_cours -> fini, et attribution des points (UNE seule fois : l'UPDATE ne
 * réussit que pour une session en cours, dans la même transaction que les
 * points). Montants fixes : 5 par bar visité, +50 SAM, +30 hôte, multipliés
 * par l'abonnement (VIP x2, Premium x5). Retourne les gains, ou null si la
 * session n'était pas en cours.
 */
export function terminerSession(sessionId: string): GainSession[] | null {
  return db.transaction((): GainSession[] | null => {
    const res = db
      .prepare(`UPDATE session_barathon SET etat = 'fini', updated = ? WHERE id = ? AND etat = 'en_cours'`)
      .run(maintenant(), sessionId);
    if (res.changes === 0) return null;
    const s: any = db.prepare('SELECT hote_id, bar_actuel FROM session_barathon WHERE id = ?').get(sessionId);
    const nbBars: number = (db.prepare('SELECT COUNT(*) AS n FROM session_bar WHERE session_id = ?').get(sessionId) as any).n;
    const visites = nbBars === 0 ? 0 : Math.min(s.bar_actuel + 1, nbBars);
    const participants = new Set<string>(
      (db.prepare('SELECT user_id FROM session_membre WHERE session_id = ?').all(sessionId) as any[]).map((r) => r.user_id)
    );
    if (s.hote_id) participants.add(s.hote_id);
    const sams = new Set<string>(
      (db.prepare('SELECT user_id FROM session_sam WHERE session_id = ?').all(sessionId) as any[]).map((r) => r.user_id)
    );
    const gains: GainSession[] = [];
    for (const userId of participants) {
      const base =
        visites * POINTS_PAR_BAR + (sams.has(userId) ? POINTS_BONUS_SAM : 0) + (userId === s.hote_id ? POINTS_BONUS_HOTE : 0);
      const droits: any = db.prepare('SELECT abonnement FROM droits WHERE user_id = ?').get(userId);
      const abonnement: string = droits?.abonnement ?? 'Gratuit';
      const multiplicateur = MULTIPLICATEUR_ABONNEMENT[abonnement] ?? 1;
      const total = base * multiplicateur;
      if (total > 0) ajouterPoints(userId, total);
      gains.push({ user_id: userId, base, total, abonnement, multiplicateur, bars_visites: visites });
    }
    return gains;
  })();
}

/**
 * Lancement / fin automatiques selon les dates de la session (décision du
 * serveur, aucune valeur du client). Retourne l'état final.
 */
export function appliquerTransitionAutoSession(sessionId: string): string | null {
  const s = getSessionBrute(sessionId);
  if (!s) return null;
  let etat: string = s.etat;
  if (!s.automatique) return etat;
  if (etat === 'pas_commencer' && dateSessionAtteinte(s.date_depart)) {
    if (demarrerSession(sessionId, { exigerSam: false }).ok) etat = 'en_cours';
  }
  if (etat === 'en_cours' && dateSessionAtteinte(s.date_arrivee)) {
    if (terminerSession(sessionId)) etat = 'fini';
  }
  return etat;
}

/** Membres de la session avec leurs points, du plus haut au plus bas (classement de fin). */
export function classementSession(sessionId: string) {
  return db
    .prepare(
      `SELECT p.user_id AS id, p.pseudo, p.prenom, p.nom, p.avatar, COALESCE(d.points, 0) AS points
       FROM session_membre m
       JOIN profil p ON p.user_id = m.user_id
       LEFT JOIN droits d ON d.user_id = m.user_id
       WHERE m.session_id = ?
       ORDER BY points DESC`
    )
    .all(sessionId);
}

// ===== Boutique et abonnements =====

const TYPES_ARTICLE = ['decoration_avatar', 'titre', 'theme'];

/**
 * Articles d'un type, paginés (ordre de création), avec l'état de
 * l'utilisateur : possede, equipe, favori (tous false si userId est null).
 */
export function listerArticlesPourUtilisateur(
  userId: string | null,
  type: string,
  page: number,
  parPage: number
) {
  if (!TYPES_ARTICLE.includes(type)) return { items: [], total: 0 };
  const uid = userId ?? '';
  const limite = Math.max(1, Math.min(48, Math.trunc(parPage) || 12));
  const decalage = (Math.max(1, Math.trunc(page) || 1) - 1) * limite;

  const total = (db.prepare('SELECT COUNT(*) AS n FROM boutique WHERE type = ?').get(type) as any).n as number;
  const items = db
    .prepare(
      `SELECT b.id, b.nom, b.prix, b.type, b.image, b.titre,
              EXISTS(SELECT 1 FROM possession po WHERE po.user_id = ? AND po.article_id = b.id) AS possede,
              CASE WHEN b.id IN (pr.equipe_decoration_id, pr.equipe_titre_id, pr.equipe_theme_id)
                   THEN 1 ELSE 0 END AS equipe,
              EXISTS(SELECT 1 FROM favori_article fa WHERE fa.user_id = ? AND fa.article_id = b.id) AS favori
       FROM boutique b
       LEFT JOIN profil pr ON pr.user_id = ?
       WHERE b.type = ?
       ORDER BY b.created, b.id
       LIMIT ? OFFSET ?`
    )
    .all(uid, uid, uid, type, limite, decalage)
    .map((l) => booleens(l, ['possede', 'equipe', 'favori']));
  return { items, total };
}

/**
 * Achat d'un article, en une seule transaction : l'article existe, n'est pas
 * déjà possédé, les points suffisent (débit conditionnel), puis possession.
 * Retourne { ok: true, points } ou { ok: false, code } avec code =
 * 'introuvable' | 'deja_possede' | 'points_insuffisants'.
 */
export function acheterArticle(userId: string, articleId: string) {
  const transaction = db.transaction((uid: string, aid: string) => {
    const article: any = db.prepare('SELECT id, prix FROM boutique WHERE id = ?').get(aid);
    if (!article) return { ok: false, code: 'introuvable' };

    const possede = db
      .prepare('SELECT 1 FROM possession WHERE user_id = ? AND article_id = ?')
      .get(uid, aid);
    if (possede) return { ok: false, code: 'deja_possede' };

    creerProfilEtDroits(uid);
    const debit = db
      .prepare('UPDATE droits SET points = points - ?, updated = ? WHERE user_id = ? AND points >= ?')
      .run(article.prix, maintenant(), uid, article.prix);
    if (debit.changes !== 1) return { ok: false, code: 'points_insuffisants' };

    // La clé primaire (user_id, article_id) interdit de toute façon un doublon :
    // en cas d'échec ici, la transaction entière (débit compris) est annulée.
    db.prepare('INSERT INTO possession (user_id, article_id) VALUES (?, ?)').run(uid, aid);

    const solde: any = db.prepare('SELECT points FROM droits WHERE user_id = ?').get(uid);
    return { ok: true, points: solde.points as number };
  });
  return transaction(userId, articleId) as
    | { ok: true; points: number }
    | { ok: false; code: string };
}

/**
 * Équipe un article POSSÉDÉ. Le slot dépend du type de l'article (jamais d'une
 * valeur du client). Retourne { ok: true, type } ou { ok: false, code } avec
 * code = 'introuvable' | 'non_possede'.
 */
export function equiperArticle(userId: string, articleId: string) {
  const transaction = db.transaction((uid: string, aid: string) => {
    const article: any = db.prepare('SELECT id, type FROM boutique WHERE id = ?').get(aid);
    if (!article) return { ok: false, code: 'introuvable' };
    const possede = db
      .prepare('SELECT 1 FROM possession WHERE user_id = ? AND article_id = ?')
      .get(uid, aid);
    if (!possede) return { ok: false, code: 'non_possede' };

    creerProfilEtDroits(uid);
    const date = maintenant();
    // Correspondance fixe type -> colonne, une requête préparée par slot
    if (article.type === 'decoration_avatar') {
      db.prepare('UPDATE profil SET equipe_decoration_id = ?, updated = ? WHERE user_id = ?').run(aid, date, uid);
    } else if (article.type === 'titre') {
      db.prepare('UPDATE profil SET equipe_titre_id = ?, updated = ? WHERE user_id = ?').run(aid, date, uid);
    } else if (article.type === 'theme') {
      db.prepare('UPDATE profil SET equipe_theme_id = ?, updated = ? WHERE user_id = ?').run(aid, date, uid);
    } else {
      return { ok: false, code: 'introuvable' };
    }
    return { ok: true, type: article.type as string };
  });
  return transaction(userId, articleId) as { ok: true; type: string } | { ok: false; code: string };
}

/** Retire l'article équipé d'un type ('decoration_avatar' | 'titre' | 'theme'). false si type invalide. */
export function desequiperType(userId: string, type: string): boolean {
  const date = maintenant();
  if (type === 'decoration_avatar') {
    db.prepare('UPDATE profil SET equipe_decoration_id = NULL, updated = ? WHERE user_id = ?').run(date, userId);
  } else if (type === 'titre') {
    db.prepare('UPDATE profil SET equipe_titre_id = NULL, updated = ? WHERE user_id = ?').run(date, userId);
  } else if (type === 'theme') {
    db.prepare('UPDATE profil SET equipe_theme_id = NULL, updated = ? WHERE user_id = ?').run(date, userId);
  } else {
    return false;
  }
  return true;
}

// ===== Jeux et quiz =====

const THEMES_QUIZ = ['jeux_video', 'histoire', 'cultrue_g'];

/**
 * Questions de quiz tirées au hasard, pour une liste de thèmes (valeurs hors
 * liste ignorées ; liste vide = tous les thèmes). reponse_1..4 en booléens.
 */
export function listerQuestionsAleatoires(themes: string[], limite: number) {
  const valides = (themes ?? []).filter((t) => THEMES_QUIZ.includes(t));
  const max = Math.max(1, Math.min(100, Math.trunc(limite) || 10));
  const lignes =
    valides.length > 0
      ? db
          .prepare(
            `SELECT * FROM question_quiz WHERE theme IN (${valides.map(() => '?').join(',')})
             ORDER BY RANDOM() LIMIT ?`
          )
          .all(...valides, max)
      : db.prepare('SELECT * FROM question_quiz ORDER BY RANDOM() LIMIT ?').all(max);
  return lignes.map((l) => booleens(l, ['reponse_1', 'reponse_2', 'reponse_3', 'reponse_4']));
}

// Barème côté serveur : points maximum accordés pour UNE partie, par jeu, et
// plafond quotidien par utilisateur. Le score envoyé par le client est borné
// par ces valeurs, jamais cru tel quel.
export const JEUX_SCORE: Record<string, number> = {
  memorie: 300,
  reflex: 600,
  rythme: 1500,
  questionaire: 300,
};
export const PLAFOND_QUOTIDIEN = 2000;
export const DELAI_MIN_PARTIES_S = 10;

/**
 * Enregistre une partie et crédite les points (calculés par le serveur).
 * Retourne { ok: true, points, solde, plafondAtteint } ou
 * { ok: false, code: 'jeu_inconnu' | 'trop_rapide', retryAfter? }.
 */
export function enregistrerPartie(userId: string, jeu: string, scoreClient: number) {
  const plafondPartie = Object.prototype.hasOwnProperty.call(JEUX_SCORE, jeu) ? JEUX_SCORE[jeu] : 0;
  if (!plafondPartie) return { ok: false, code: 'jeu_inconnu' } as const;

  const transaction = db.transaction((uid: string) => {
    const maintenantMs = Date.now();
    const derniere: any = db
      .prepare('SELECT created FROM partie WHERE user_id = ? ORDER BY created DESC LIMIT 1')
      .get(uid);
    if (derniere) {
      const ecoule = (maintenantMs - Date.parse(derniere.created)) / 1000;
      if (ecoule < DELAI_MIN_PARTIES_S) {
        return { ok: false, code: 'trop_rapide', retryAfter: Math.ceil(DELAI_MIN_PARTIES_S - ecoule) } as const;
      }
    }

    const debutJour = new Date(maintenantMs);
    debutJour.setUTCHours(0, 0, 0, 0);
    const deja: any = db
      .prepare('SELECT COALESCE(SUM(points), 0) AS total FROM partie WHERE user_id = ? AND created >= ?')
      .get(uid, debutJour.toISOString());

    const score = Number.isFinite(scoreClient) ? Math.max(0, Math.min(Math.trunc(scoreClient), plafondPartie)) : 0;
    const restant = Math.max(0, PLAFOND_QUOTIDIEN - deja.total);
    const points = Math.min(score, restant);

    creerProfilEtDroits(uid);
    db.prepare('INSERT INTO partie (id, user_id, jeu, score, points, created) VALUES (?, ?, ?, ?, ?, ?)').run(
      nouvelId(), uid, jeu, score, points, new Date(maintenantMs).toISOString()
    );
    const solde = points > 0 ? ajouterPoints(uid, points) : (getDroits(uid)?.points ?? 0);
    return { ok: true, points, solde, plafondAtteint: points < score } as const;
  });
  return transaction(userId);
}

// ===== Administration =====

// Fonctions réservées aux routes /api/admin/* et à la page /admin (chacune
// commence par exigerAdmin / vérifie locals.droits.admin). Les noms de
// colonnes viennent de listes blanches fixes, jamais du client.

const COLONNES_BAR = [
  'nom', 'description', 'adresse', 'latitude', 'longitude',
  'horaires_lundi', 'horaires_mardi', 'horaires_mercredi', 'horaires_jeudi',
  'horaires_vendredi', 'horaires_samedi', 'horaires_dimanche',
];
const COLONNES_JEU = ['nom', 'description', 'type'];

function aLaCle(objet: Record<string, any>, cle: string): boolean {
  return Object.prototype.hasOwnProperty.call(objet, cle);
}

// ---------- Utilisateurs ----------

/** Tous les comptes (l'admin peut voir les e-mails) avec droits et présence d'un mot de passe. */
export function adminListerUtilisateurs() {
  const lignes: any[] = db
    .prepare(
      `SELECT u.id, u.email, u.name, u.createdAt,
              p.pseudo, p.prenom, p.nom,
              d.admin, d.points, d.abonnement, d.verifie,
              EXISTS (SELECT 1 FROM account a
                      WHERE a.userId = u.id AND a.providerId = 'credential' AND a.password IS NOT NULL) AS a_mot_de_passe
       FROM "user" u
       LEFT JOIN profil p ON p.user_id = u.id
       LEFT JOIN droits d ON d.user_id = u.id
       ORDER BY u.createdAt`
    )
    .all();
  return lignes.map((l) => ({
    id: l.id,
    email: l.email,
    name: l.name,
    createdAt: l.createdAt,
    pseudo: l.pseudo,
    prenom: l.prenom,
    nom: l.nom,
    admin: l.admin === 1,
    points: l.points ?? 0,
    abonnement: l.abonnement ?? 'Gratuit',
    verifie: l.verifie === 1,
    a_mot_de_passe: l.a_mot_de_passe === 1,
  }));
}

/** { id, avatar } d'un compte, ou null s'il n'existe pas. */
export function adminGetUtilisateur(userId: string) {
  return (
    db
      .prepare('SELECT u.id, p.avatar FROM "user" u LEFT JOIN profil p ON p.user_id = u.id WHERE u.id = ?')
      .get(userId) ?? null
  );
}

/**
 * Met à jour les droits d'un compte (champs optionnels : admin, verifie,
 * abonnement, points). Tout ou rien. Retourne false si le compte n'existe pas
 * ou si une valeur est invalide.
 */
export function adminMettreAJourDroits(
  userId: string,
  champs: { admin?: boolean; verifie?: boolean; abonnement?: string; points?: number }
): boolean {
  if (!adminGetUtilisateur(userId)) return false;
  if (aLaCle(champs, 'abonnement') && !ABONNEMENTS.includes(champs.abonnement as string)) return false;
  if (aLaCle(champs, 'points') && !(Number.isSafeInteger(champs.points) && (champs.points as number) >= 0)) return false;
  db.transaction(() => {
    creerProfilEtDroits(userId);
    if (aLaCle(champs, 'admin')) definirAdmin(userId, champs.admin === true);
    if (aLaCle(champs, 'verifie')) definirVerifie(userId, champs.verifie === true);
    if (aLaCle(champs, 'abonnement')) definirAbonnement(userId, champs.abonnement as string);
    if (aLaCle(champs, 'points')) {
      db.prepare('UPDATE droits SET points = ?, updated = ? WHERE user_id = ?').run(champs.points, maintenant(), userId);
    }
  })();
  return true;
}

/** Supprime un compte (les tables liées partent en cascade). Retourne { existe, avatar }. */
export function adminSupprimerUtilisateur(userId: string): { existe: boolean; avatar: string | null } {
  const u: any = adminGetUtilisateur(userId);
  if (!u) return { existe: false, avatar: null };
  db.prepare('DELETE FROM "user" WHERE id = ?').run(userId);
  return { existe: true, avatar: u.avatar ?? null };
}

// ---------- Sessions ----------

export function adminListerSessions() {
  return db
    .prepare('SELECT id, nom, etat, date_depart, created FROM session_barathon ORDER BY created DESC')
    .all();
}

export function adminSupprimerSession(id: string): boolean {
  return db.prepare('DELETE FROM session_barathon WHERE id = ?').run(id).changes > 0;
}

// ---------- Bars ----------

/** Tous les bars avec `images` (img), `galerie` et `boissons_ids`. */
export function adminListerBars() {
  const bars: any[] = db.prepare('SELECT * FROM bar ORDER BY nom').all();
  const images: any[] = db
    .prepare('SELECT bar_id, type, fichier FROM bar_image ORDER BY bar_id, type, position')
    .all();
  const liens: any[] = db.prepare('SELECT bar_id, boisson_id FROM bar_boisson').all();
  const parBar = new Map<string, any>();
  for (const b of bars) {
    b.images = [];
    b.galerie = [];
    b.boissons_ids = [];
    parBar.set(b.id, b);
  }
  for (const i of images) {
    const b = parBar.get(i.bar_id);
    if (b) (i.type === 'img' ? b.images : b.galerie).push(i.fichier);
  }
  for (const l of liens) parBar.get(l.bar_id)?.boissons_ids.push(l.boisson_id);
  return bars;
}

/**
 * Crée (id inconnu) ou met à jour (id existant) un bar, en une transaction.
 * - champs : seules les colonnes de COLONNES_BAR présentes sont écrites ;
 * - options.boissons : liste d'ids qui REMPLACE les boissons liées ;
 * - options.images : { img?: {retirer, ajouter}, galerie?: {retirer, ajouter} }
 *   (retirer = clés actuelles à enlever, ajouter = nouvelles clés).
 * Retourne { supprimes } : clés de fichiers à effacer du stockage.
 */
export function adminEnregistrerBar(
  id: string,
  champs: Record<string, any>,
  options: {
    boissons?: string[];
    images?: Record<string, { retirer: string[]; ajouter: string[] }>;
  } = {}
): { supprimes: string[] } {
  const supprimes: string[] = [];
  const date = maintenant();
  db.transaction(() => {
    const colonnes = COLONNES_BAR.filter((c) => aLaCle(champs, c));
    if (!db.prepare('SELECT 1 FROM bar WHERE id = ?').get(id)) {
      const noms = ['id', ...colonnes, 'created', 'updated'];
      db.prepare(`INSERT INTO bar (${noms.join(', ')}) VALUES (${noms.map(() => '?').join(', ')})`).run(
        id, ...colonnes.map((c) => champs[c]), date, date
      );
    } else {
      const sets = [...colonnes.map((c) => `${c} = ?`), 'updated = ?'];
      db.prepare(`UPDATE bar SET ${sets.join(', ')} WHERE id = ?`).run(...colonnes.map((c) => champs[c]), date, id);
    }

    for (const type of ['img', 'galerie']) {
      const modif = options.images?.[type];
      if (!modif) continue;
      const actuels: string[] = db
        .prepare('SELECT fichier FROM bar_image WHERE bar_id = ? AND type = ? ORDER BY position')
        .all(id, type)
        .map((r: any) => r.fichier);
      const aRetirer = new Set(modif.retirer);
      const gardes = actuels.filter((f) => !aRetirer.has(f));
      for (const f of actuels) if (aRetirer.has(f)) supprimes.push(f);
      db.prepare('DELETE FROM bar_image WHERE bar_id = ? AND type = ?').run(id, type);
      [...gardes, ...modif.ajouter].forEach((fichier, position) => {
        db.prepare('INSERT INTO bar_image (bar_id, type, position, fichier) VALUES (?, ?, ?, ?)').run(
          id, type, position, fichier
        );
      });
    }

    if (Array.isArray(options.boissons)) {
      db.prepare('DELETE FROM bar_boisson WHERE bar_id = ?').run(id);
      for (const bid of options.boissons) {
        db.prepare('INSERT OR IGNORE INTO bar_boisson (bar_id, boisson_id) SELECT ?, id FROM boisson WHERE id = ?').run(
          id, bid
        );
      }
    }
  })();
  return { supprimes };
}

/** Supprime un bar. Retourne { existe, fichiers } (clés à effacer du stockage). */
export function adminSupprimerBar(id: string): { existe: boolean; fichiers: string[] } {
  let existe = false;
  let fichiers: string[] = [];
  db.transaction(() => {
    fichiers = db.prepare('SELECT fichier FROM bar_image WHERE bar_id = ?').all(id).map((r: any) => r.fichier);
    existe = db.prepare('DELETE FROM bar WHERE id = ?').run(id).changes > 0;
  })();
  return { existe, fichiers: existe ? fichiers : [] };
}

// ---------- Boissons ----------

export function adminGetBoisson(id: string) {
  return db.prepare('SELECT * FROM boisson WHERE id = ?').get(id) ?? null;
}

/** Crée ou met à jour une boisson. `image` : nouvelle clé, ou null/undefined pour garder l'actuelle. */
export function adminEnregistrerBoisson(id: string, nom: string, image?: string | null): void {
  const date = maintenant();
  db.prepare(
    `INSERT INTO boisson (id, nom, image, created, updated) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET nom = excluded.nom,
       image = COALESCE(excluded.image, boisson.image), updated = excluded.updated`
  ).run(id, nom, image ?? null, date, date);
}

/** Supprime une boisson. Retourne { existe, image }. */
export function adminSupprimerBoisson(id: string): { existe: boolean; image: string | null } {
  const b: any = adminGetBoisson(id);
  if (!b) return { existe: false, image: null };
  db.prepare('DELETE FROM boisson WHERE id = ?').run(id);
  return { existe: true, image: b.image ?? null };
}

// ---------- Jeux ----------

/** Tous les jeux avec `images` (clés ordonnées). */
export function adminListerJeux() {
  const jeux: any[] = db.prepare('SELECT * FROM jeu ORDER BY nom').all();
  const images: any[] = db.prepare('SELECT jeu_id, fichier FROM jeu_image ORDER BY jeu_id, position').all();
  const parJeu = new Map<string, any>();
  for (const j of jeux) {
    j.images = [];
    parJeu.set(j.id, j);
  }
  for (const i of images) parJeu.get(i.jeu_id)?.images.push(i.fichier);
  return jeux;
}

/**
 * Crée ou met à jour un jeu (colonnes nom, description, type présentes dans
 * `champs`) et ses images. Retourne { supprimes } : clés à effacer du stockage.
 */
export function adminEnregistrerJeu(
  id: string,
  champs: Record<string, any>,
  images?: { retirer: string[]; ajouter: string[] }
): { supprimes: string[] } {
  const supprimes: string[] = [];
  const date = maintenant();
  db.transaction(() => {
    const colonnes = COLONNES_JEU.filter((c) => aLaCle(champs, c));
    if (!db.prepare('SELECT 1 FROM jeu WHERE id = ?').get(id)) {
      const noms = ['id', ...colonnes, 'created', 'updated'];
      db.prepare(`INSERT INTO jeu (${noms.join(', ')}) VALUES (${noms.map(() => '?').join(', ')})`).run(
        id, ...colonnes.map((c) => champs[c]), date, date
      );
    } else {
      const sets = [...colonnes.map((c) => `${c} = ?`), 'updated = ?'];
      db.prepare(`UPDATE jeu SET ${sets.join(', ')} WHERE id = ?`).run(...colonnes.map((c) => champs[c]), date, id);
    }
    if (images) {
      const actuels: string[] = db
        .prepare('SELECT fichier FROM jeu_image WHERE jeu_id = ? ORDER BY position')
        .all(id)
        .map((r: any) => r.fichier);
      const aRetirer = new Set(images.retirer);
      const gardes = actuels.filter((f) => !aRetirer.has(f));
      for (const f of actuels) if (aRetirer.has(f)) supprimes.push(f);
      db.prepare('DELETE FROM jeu_image WHERE jeu_id = ?').run(id);
      [...gardes, ...images.ajouter].forEach((fichier, position) => {
        db.prepare('INSERT INTO jeu_image (jeu_id, position, fichier) VALUES (?, ?, ?)').run(id, position, fichier);
      });
    }
  })();
  return { supprimes };
}

/** Supprime un jeu. Retourne { existe, fichiers }. */
export function adminSupprimerJeu(id: string): { existe: boolean; fichiers: string[] } {
  let existe = false;
  let fichiers: string[] = [];
  db.transaction(() => {
    fichiers = db.prepare('SELECT fichier FROM jeu_image WHERE jeu_id = ?').all(id).map((r: any) => r.fichier);
    existe = db.prepare('DELETE FROM jeu WHERE id = ?').run(id).changes > 0;
  })();
  return { existe, fichiers: existe ? fichiers : [] };
}

// ---------- Boutique ----------

/** Crée ou met à jour un article (valeurs finales : l'appelant a déjà validé le type, l'image ou le titre). */
export function adminEnregistrerArticle(
  id: string,
  a: { nom: string; prix: number; type: string; image: string | null; titre: string | null }
): void {
  const date = maintenant();
  db.prepare(
    `INSERT INTO boutique (id, nom, prix, type, image, titre, created, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET nom = excluded.nom, prix = excluded.prix, type = excluded.type,
       image = excluded.image, titre = excluded.titre, updated = excluded.updated`
  ).run(id, a.nom, a.prix, a.type, a.image, a.titre, date, date);
}

/** Supprime un article (possessions et favoris en cascade, articles équipés remis à null). */
export function adminSupprimerArticle(id: string): { existe: boolean; image: string | null } {
  const a: any = getArticle(id);
  if (!a) return { existe: false, image: null };
  db.prepare('DELETE FROM boutique WHERE id = ?').run(id);
  return { existe: true, image: a.image ?? null };
}

// ---------- Questions du quiz ----------

/** Crée ou met à jour une question (valeurs déjà validées par l'appelant). */
export function adminEnregistrerQuestion(
  id: string,
  q: { theme: string; question: string; choix: string[]; bonne: number }
): void {
  const date = maintenant();
  const rep = [1, 2, 3, 4].map((n) => (q.bonne === n ? 1 : 0));
  db.prepare(
    `INSERT INTO question_quiz (id, theme, question,
       choix_1, reponse_1, choix_2, reponse_2, choix_3, reponse_3, choix_4, reponse_4, created, updated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET theme = excluded.theme, question = excluded.question,
       choix_1 = excluded.choix_1, reponse_1 = excluded.reponse_1,
       choix_2 = excluded.choix_2, reponse_2 = excluded.reponse_2,
       choix_3 = excluded.choix_3, reponse_3 = excluded.reponse_3,
       choix_4 = excluded.choix_4, reponse_4 = excluded.reponse_4,
       updated = excluded.updated`
  ).run(
    id, q.theme, q.question,
    q.choix[0], rep[0], q.choix[1], rep[1], q.choix[2], rep[2], q.choix[3], rep[3],
    date, date
  );
}

export function adminQuestionExiste(id: string): boolean {
  return !!db.prepare('SELECT 1 FROM question_quiz WHERE id = ?').get(id);
}

export function adminSupprimerQuestion(id: string): boolean {
  return db.prepare('DELETE FROM question_quiz WHERE id = ?').run(id).changes > 0;
}
