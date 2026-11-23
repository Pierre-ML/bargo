// =====================================================================
// Migration PocketBase -> SQLite pour BARGO.
//
// À quoi sert ce script : lit une copie de la base PocketBase (pb_data/data.db,
// ouverte en LECTURE SEULE, et pb_data/storage) et recopie les données dans la
// base SQLite de l'application (schéma sql/schema.sql) ainsi que les images
// dans le dossier de fichiers (voir src/lib/stockage.js).
//
// Lancement :
//   node scripts/migrer-pocketbase.mjs [--source copie-pb/pbbargo]
//   node --env-file=.env scripts/migrer-pocketbase.mjs
// Variables (facultatives) :
//   DATABASE_PATH  base cible          (défaut data/bargo.db)
//   UPLOAD_DIR     dossier des fichiers (défaut data/uploads)
//
// Relançable : tout se fait dans UNE transaction, les identifiants PocketBase
// sont conservés (INSERT ... ON CONFLICT DO UPDATE pour les tables à id,
// INSERT OR IGNORE pour les tables de liaison) : relancer ne crée pas de
// doublons. Attention : relancer écrase les lignes déjà migrées par les
// valeurs PocketBase (à ne pas faire après des modifications dans l'appli).
// La base cible est créée si besoin (schema.sql puis seed.sql).
//
// Les mots de passe PocketBase ne sont PAS migrés (aucune ligne "account") :
// un administrateur devra définir un mot de passe temporaire à chaque compte.
// Les compteurs barathon_organiser / barathon_participer ne sont pas migrés
// (recalculables depuis les sessions). Les images non jpg/png/webp/gif (svg...)
// sont ignorées. Rien de personnel n'est affiché en sortie.
// =====================================================================
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---- Arguments et chemins ---------------------------------------------
function lireSource() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--source' && args[i + 1]) return args[i + 1];
    if (args[i].startsWith('--source=')) return args[i].slice('--source='.length);
  }
  return 'copie-pb/pbbargo';
}
const SOURCE = path.resolve(lireSource());
const CIBLE = path.resolve(process.env.DATABASE_PATH ?? 'data/bargo.db');
const UPLOADS = path.resolve(process.env.UPLOAD_DIR ?? 'data/uploads');
const SOURCE_DB = path.join(SOURCE, 'pb_data', 'data.db');
const SOURCE_STORAGE = path.join(SOURCE, 'pb_data', 'storage');

if (!fs.existsSync(SOURCE_DB)) {
  console.error('Base PocketBase introuvable (voir --source).');
  process.exit(1);
}

// ---- Constantes -------------------------------------------------------
const ABONNEMENTS = ['Gratuit', 'VIP', 'Premium'];
const TYPES_JEU = ['questionaire', 'memorie', 'reflex', 'rythme'];
const THEMES_QUIZ = ['jeux_video', 'histoire', 'cultrue_g'];
const TYPES_BOUTIQUE = ['theme', 'titre', 'decoration_avatar'];
const ETATS = ['pas_commencer', 'en_cours', 'fini'];
const REGEX_ID = /^[A-Za-z0-9_-]{1,40}$/;

// ---- Compteurs --------------------------------------------------------
const avertissements = new Map();
function avertir(libelle, n = 1) {
  avertissements.set(libelle, (avertissements.get(libelle) ?? 0) + n);
}
const fichiers = { copies: 0, existants: 0, ignores: 0, absents: 0 };

// ---- Utilitaires ------------------------------------------------------
const maintenant = () => new Date().toISOString();

// 'YYYY-MM-DD HH:MM:SS.sssZ' -> 'YYYY-MM-DDTHH:MM:SS.sssZ'
function dateIso(valeur) {
  if (typeof valeur !== 'string' || !valeur.trim()) return null;
  return valeur.trim().replace(' ', 'T');
}
const dateIsoOuMaintenant = (v) => dateIso(v) ?? maintenant();

// Liste PocketBase (JSON texte, ou texte simple) -> tableau de chaînes sans doublon
function liste(valeur) {
  if (valeur == null || valeur === '') return [];
  let tableau;
  if (Array.isArray(valeur)) tableau = valeur;
  else if (typeof valeur === 'string' && valeur.trim().startsWith('[')) {
    try { tableau = JSON.parse(valeur); } catch { avertir('JSON illisible'); return []; }
  } else tableau = [String(valeur)];
  return [...new Set(tableau.filter((x) => typeof x === 'string' && x !== ''))];
}

// Garde uniquement les ids présents dans "valides" ; compte les autres.
function garder(ids, valides, etiquette) {
  return ids.filter((id) => {
    if (valides.has(id)) return true;
    avertir(`relation vers un enregistrement inexistant (${etiquette})`);
    return false;
  });
}
function garderUn(id, valides, etiquette) {
  if (!id) return null;
  if (valides.has(id)) return id;
  avertir(`relation vers un enregistrement inexistant (${etiquette})`);
  return null;
}
function dansListe(valeur, permises, defaut, etiquette) {
  if (permises.includes(valeur)) return valeur;
  avertir(`valeur hors schéma remplacée (${etiquette})`);
  return defaut;
}
const booleen = (v) => (v === 1 || v === true || v === '1' || v === 'true' ? 1 : 0);
function entierOuNull(v) {
  const n = Number(v);
  return v === null || v === '' || v === undefined || !Number.isFinite(n) ? null : Math.round(n);
}

// ---- Fichiers ---------------------------------------------------------
function detecterImage(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  const t = buf.subarray(0, 6).toString('latin1');
  if (t === 'GIF87a' || t === 'GIF89a') return 'gif';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

const idsCollections = new Map();

// Copie un fichier PocketBase vers UPLOADS et renvoie sa clé (ou null).
function copierFichier(collection, idRecord, nomOrigine, dossier, champ, index) {
  if (!nomOrigine || typeof nomOrigine !== 'string') return null;
  const idCollection = idsCollections.get(collection);
  if (!idCollection || !REGEX_ID.test(idRecord) || path.basename(nomOrigine) !== nomOrigine) {
    fichiers.ignores++;
    return null;
  }
  const source = path.join(SOURCE_STORAGE, idCollection, idRecord, nomOrigine);
  let contenu;
  try {
    contenu = fs.readFileSync(source);
  } catch {
    fichiers.absents++;
    return null;
  }
  const ext = detecterImage(contenu);
  if (!ext) {
    fichiers.ignores++;
    return null;
  }
  const cle = `${dossier}/${idRecord}/${champ}-${index}.${ext}`;
  const destination = path.join(UPLOADS, ...cle.split('/'));
  let taille = -1;
  try { taille = fs.statSync(destination).size; } catch { /* absent */ }
  if (taille === contenu.length) {
    fichiers.existants++;
  } else {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, contenu);
    fichiers.copies++;
  }
  return cle;
}

// ---- Ouverture des bases ---------------------------------------------
const src = new Database(SOURCE_DB, { readonly: true, fileMustExist: true });
for (const c of src.prepare('SELECT id, name FROM _collections').all()) idsCollections.set(c.name, c.id);

fs.mkdirSync(path.dirname(CIBLE), { recursive: true });
fs.mkdirSync(UPLOADS, { recursive: true });
const db = new Database(CIBLE);
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.join(RACINE, 'sql', 'schema.sql'), 'utf8'));
const fichierSeed = path.join(RACINE, 'sql', 'seed.sql');
if (fs.existsSync(fichierSeed)) db.exec(fs.readFileSync(fichierSeed, 'utf8'));

// ---- Requêtes préparées -----------------------------------------------
const P = {
  boisson: db.prepare(`INSERT INTO boisson (id, nom, image, created, updated) VALUES (@id, @nom, @image, @created, @updated)
    ON CONFLICT(id) DO UPDATE SET nom = excluded.nom, image = excluded.image, created = excluded.created, updated = excluded.updated`),
  bar: db.prepare(`INSERT INTO bar (id, nom, description, adresse, latitude, longitude, liens, specialites, disponibilite, contact,
      horaires_lundi, horaires_mardi, horaires_mercredi, horaires_jeudi, horaires_vendredi, horaires_samedi, horaires_dimanche, created, updated)
    VALUES (@id, @nom, @description, @adresse, @latitude, @longitude, @liens, @specialites, @disponibilite, @contact,
      @horaires_lundi, @horaires_mardi, @horaires_mercredi, @horaires_jeudi, @horaires_vendredi, @horaires_samedi, @horaires_dimanche, @created, @updated)
    ON CONFLICT(id) DO UPDATE SET nom = excluded.nom, description = excluded.description, adresse = excluded.adresse,
      latitude = excluded.latitude, longitude = excluded.longitude, liens = excluded.liens, specialites = excluded.specialites,
      disponibilite = excluded.disponibilite, contact = excluded.contact,
      horaires_lundi = excluded.horaires_lundi, horaires_mardi = excluded.horaires_mardi, horaires_mercredi = excluded.horaires_mercredi,
      horaires_jeudi = excluded.horaires_jeudi, horaires_vendredi = excluded.horaires_vendredi, horaires_samedi = excluded.horaires_samedi,
      horaires_dimanche = excluded.horaires_dimanche, created = excluded.created, updated = excluded.updated`),
  barImage: db.prepare(`INSERT INTO bar_image (bar_id, type, position, fichier) VALUES (?, ?, ?, ?)
    ON CONFLICT(bar_id, type, position) DO UPDATE SET fichier = excluded.fichier`),
  barBoisson: db.prepare('INSERT OR IGNORE INTO bar_boisson (bar_id, boisson_id) VALUES (?, ?)'),
  jeu: db.prepare(`INSERT INTO jeu (id, nom, description, type, created, updated) VALUES (@id, @nom, @description, @type, @created, @updated)
    ON CONFLICT(id) DO UPDATE SET nom = excluded.nom, description = excluded.description, type = excluded.type,
      created = excluded.created, updated = excluded.updated`),
  jeuImage: db.prepare(`INSERT INTO jeu_image (jeu_id, position, fichier) VALUES (?, ?, ?)
    ON CONFLICT(jeu_id, position) DO UPDATE SET fichier = excluded.fichier`),
  boutique: db.prepare(`INSERT INTO boutique (id, nom, prix, type, image, titre, created, updated)
    VALUES (@id, @nom, @prix, @type, @image, @titre, @created, @updated)
    ON CONFLICT(id) DO UPDATE SET nom = excluded.nom, prix = excluded.prix, type = excluded.type, image = excluded.image,
      titre = excluded.titre, created = excluded.created, updated = excluded.updated`),
  question: db.prepare(`INSERT INTO question_quiz (id, theme, question, choix_1, reponse_1, choix_2, reponse_2, choix_3, reponse_3, choix_4, reponse_4, created, updated)
    VALUES (@id, @theme, @question, @choix_1, @reponse_1, @choix_2, @reponse_2, @choix_3, @reponse_3, @choix_4, @reponse_4, @created, @updated)
    ON CONFLICT(id) DO UPDATE SET theme = excluded.theme, question = excluded.question,
      choix_1 = excluded.choix_1, reponse_1 = excluded.reponse_1, choix_2 = excluded.choix_2, reponse_2 = excluded.reponse_2,
      choix_3 = excluded.choix_3, reponse_3 = excluded.reponse_3, choix_4 = excluded.choix_4, reponse_4 = excluded.reponse_4,
      created = excluded.created, updated = excluded.updated`),
  emailExistant: db.prepare('SELECT id FROM "user" WHERE email = ?'),
  user: db.prepare(`INSERT INTO "user" (id, name, email, emailVerified, image, createdAt, updatedAt)
    VALUES (@id, @name, @email, @emailVerified, NULL, @createdAt, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, email = excluded.email, emailVerified = excluded.emailVerified,
      createdAt = excluded.createdAt, updatedAt = excluded.updatedAt`),
  profil: db.prepare(`INSERT INTO profil (user_id, pseudo, prenom, nom, age, ville, description, insta, facebook, discord, avatar,
      equipe_decoration_id, equipe_titre_id, equipe_theme_id, created, updated)
    VALUES (@user_id, @pseudo, @prenom, @nom, @age, @ville, @description, @insta, @facebook, @discord, @avatar,
      @equipe_decoration_id, @equipe_titre_id, @equipe_theme_id, @created, @updated)
    ON CONFLICT(user_id) DO UPDATE SET pseudo = excluded.pseudo, prenom = excluded.prenom, nom = excluded.nom, age = excluded.age,
      ville = excluded.ville, description = excluded.description, insta = excluded.insta, facebook = excluded.facebook,
      discord = excluded.discord, avatar = excluded.avatar, equipe_decoration_id = excluded.equipe_decoration_id,
      equipe_titre_id = excluded.equipe_titre_id, equipe_theme_id = excluded.equipe_theme_id,
      created = excluded.created, updated = excluded.updated`),
  droits: db.prepare(`INSERT INTO droits (user_id, admin, points, abonnement, verifie, updated)
    VALUES (@user_id, @admin, @points, @abonnement, @verifie, @updated)
    ON CONFLICT(user_id) DO UPDATE SET admin = excluded.admin, points = excluded.points, abonnement = excluded.abonnement,
      verifie = excluded.verifie, updated = excluded.updated`),
  possession: db.prepare('INSERT OR IGNORE INTO possession (user_id, article_id) VALUES (?, ?)'),
  favoriBar: db.prepare('INSERT OR IGNORE INTO favori_bar (user_id, bar_id) VALUES (?, ?)'),
  favoriBoisson: db.prepare('INSERT OR IGNORE INTO favori_boisson (user_id, boisson_id) VALUES (?, ?)'),
  favoriJeu: db.prepare('INSERT OR IGNORE INTO favori_jeu (user_id, jeu_id) VALUES (?, ?)'),
  favoriArticle: db.prepare('INSERT OR IGNORE INTO favori_article (user_id, article_id) VALUES (?, ?)'),
  barDecouvert: db.prepare('INSERT OR IGNORE INTO bar_decouvert (user_id, bar_id) VALUES (?, ?)'),
  ami: db.prepare('INSERT OR IGNORE INTO ami (user_id, ami_id) VALUES (?, ?)'),
  demandeAmi: db.prepare('INSERT OR IGNORE INTO demande_ami (destinataire_id, expediteur_id) VALUES (?, ?)'),
  session: db.prepare(`INSERT INTO session_barathon (id, nom, description, date_depart, date_arrivee, etat, automatique, hote_id, jeu_id, created, updated)
    VALUES (@id, @nom, @description, @date_depart, @date_arrivee, @etat, @automatique, @hote_id, @jeu_id, @created, @updated)
    ON CONFLICT(id) DO UPDATE SET nom = excluded.nom, description = excluded.description, date_depart = excluded.date_depart,
      date_arrivee = excluded.date_arrivee, etat = excluded.etat, automatique = excluded.automatique, hote_id = excluded.hote_id,
      jeu_id = excluded.jeu_id, created = excluded.created, updated = excluded.updated`),
  sessionMembre: db.prepare('INSERT OR IGNORE INTO session_membre (session_id, user_id) VALUES (?, ?)'),
  sessionSam: db.prepare('INSERT OR IGNORE INTO session_sam (session_id, user_id) VALUES (?, ?)'),
  sessionBar: db.prepare('INSERT OR IGNORE INTO session_bar (session_id, bar_id, position) VALUES (?, ?, ?)'),
  invitation: db.prepare('INSERT OR IGNORE INTO invitation_session (session_id, user_id) VALUES (?, ?)'),
};

const lire = (table) => src.prepare(`SELECT * FROM ${table}`).all(); // table = constante du script

// ---- Migration --------------------------------------------------------
const migrer = db.transaction(() => {
  const boissons = lire('boison');
  const bars = lire('bar');
  const jeux = lire('jeux');
  const articles = lire('boutique');
  const questions = lire('jeux_questionaire');
  const utilisateurs = lire('users');
  const sessions = lire('session_barathon');

  const idBoissons = new Set(boissons.map((r) => r.id));
  const idBars = new Set(bars.map((r) => r.id));
  const idJeux = new Set(jeux.map((r) => r.id));
  const idArticles = new Set(articles.map((r) => r.id));
  const idSessions = new Set(sessions.map((r) => r.id));

  // boissons
  for (const r of boissons) {
    const image = copierFichier('boison', r.id, liste(r.img)[0], 'boisson', 'image', 0);
    P.boisson.run({ id: r.id, nom: r.nom ?? null, image, created: dateIsoOuMaintenant(r.created), updated: dateIsoOuMaintenant(r.updated) });
  }

  // bars
  for (const r of bars) {
    let latitude = null;
    let longitude = null;
    try {
      const loc = typeof r.localisation === 'string' && r.localisation ? JSON.parse(r.localisation) : null;
      const lat = Number(loc?.lat);
      const lon = Number(loc?.lon);
      if (loc && Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0)) {
        if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) { latitude = lat; longitude = lon; }
        else avertir('coordonnées hors limites ignorées');
      }
    } catch { avertir('localisation illisible'); }
    P.bar.run({
      id: r.id, nom: r.nom ?? '', description: r.description ?? '', adresse: r.adresse ?? null, latitude, longitude,
      liens: r.liens ?? null, specialites: r.specialites ?? null, disponibilite: r.disponibilite ?? null, contact: r.contact ?? null,
      horaires_lundi: r.horaires_lundi ?? null, horaires_mardi: r.horaires_mardi ?? null, horaires_mercredi: r.horaires_mercredi ?? null,
      horaires_jeudi: r.horaires_jeudi ?? null, horaires_vendredi: r.horaires_vendredi ?? null, horaires_samedi: r.horaires_samedi ?? null,
      horaires_dimanche: r.horaires_dimanche ?? null,
      created: dateIsoOuMaintenant(r.created), updated: dateIsoOuMaintenant(r.updated),
    });
    for (const champ of ['img', 'galerie']) {
      liste(r[champ]).forEach((nom, i) => {
        const cle = copierFichier('bar', r.id, nom, 'bar', champ, i);
        if (cle) P.barImage.run(r.id, champ, i, cle);
      });
    }
    for (const b of garder(liste(r.boison), idBoissons, 'bar.boisson')) P.barBoisson.run(r.id, b);
  }

  // jeux
  for (const r of jeux) {
    P.jeu.run({
      id: r.id, nom: r.nom ?? '', description: r.description ?? '',
      type: r.type_du_jeux ? dansListe(r.type_du_jeux, TYPES_JEU, null, 'jeu.type') : null,
      created: dateIsoOuMaintenant(r.created), updated: dateIsoOuMaintenant(r.updated),
    });
    liste(r.img).forEach((nom, i) => {
      const cle = copierFichier('jeux', r.id, nom, 'jeu', 'img', i);
      if (cle) P.jeuImage.run(r.id, i, cle);
    });
  }

  // boutique
  for (const r of articles) {
    const type = dansListe(r.type, TYPES_BOUTIQUE, 'titre', 'boutique.type');
    const nomFichier = type === 'decoration_avatar' ? r.type_decoration_avatar : type === 'theme' ? r.type_them : null;
    const image = copierFichier('boutique', r.id, liste(nomFichier)[0], 'boutique', 'image', 0);
    let prix = Math.round(Number(r.prix));
    if (!Number.isFinite(prix) || prix < 0) { avertir('valeur hors schéma remplacée (boutique.prix)'); prix = 0; }
    P.boutique.run({
      id: r.id, nom: r.nom ?? null, prix, type, image, titre: r.type_titre ? r.type_titre : null,
      created: dateIsoOuMaintenant(r.created), updated: dateIsoOuMaintenant(r.updated),
    });
  }

  // questions du quiz
  for (const r of questions) {
    P.question.run({
      id: r.id, theme: r.theme ? dansListe(r.theme, THEMES_QUIZ, null, 'question.theme') : null, question: r.question ?? null,
      choix_1: r.choix_1 ?? null, reponse_1: booleen(r.reponse_1),
      choix_2: r.choix_2 ?? null, reponse_2: booleen(r.reponse_2),
      choix_3: r.choix_3 ?? null, reponse_3: booleen(r.reponse_3),
      choix_4: r.choix_4 ?? null, reponse_4: booleen(r.reponse_4),
      created: dateIsoOuMaintenant(r.created), updated: dateIsoOuMaintenant(r.updated),
    });
  }

  // utilisateurs : on retient d'abord ceux qui seront migrés
  const retenus = [];
  for (const u of utilisateurs) {
    const email = typeof u.email === 'string' ? u.email.trim().toLowerCase() : '';
    if (!email || !REGEX_ID.test(u.id)) { avertir('utilisateur sauté (e-mail ou id invalide)'); continue; }
    const existant = P.emailExistant.get(email);
    if (existant && existant.id !== u.id) { avertir('utilisateur sauté (e-mail déjà présent sous un autre id)'); continue; }
    retenus.push({ u, email });
  }
  const idUsers = new Set(retenus.map((x) => x.u.id));

  for (const { u, email } of retenus) {
    const createdAt = dateIsoOuMaintenant(u.created);
    const updatedAt = dateIsoOuMaintenant(u.updated);
    P.user.run({
      id: u.id, name: u.pseudo || u.prenom || 'Utilisateur', email, emailVerified: booleen(u.verified), createdAt, updatedAt,
    });
    const avatar = copierFichier('users', u.id, liste(u.avatar)[0], 'avatar', 'avatar', 0);
    P.profil.run({
      user_id: u.id, pseudo: u.pseudo || null, prenom: u.prenom || null, nom: u.nom || null, age: entierOuNull(u.age),
      ville: u.ville || null, description: u.description || null, insta: u.insta || null, facebook: u.facbook || null,
      discord: u.discord || null, avatar,
      equipe_decoration_id: garderUn(u.equiper_avatar_decoration, idArticles, 'equiper_decoration'),
      equipe_titre_id: garderUn(u.equiper_titre, idArticles, 'equiper_titre'),
      equipe_theme_id: garderUn(u.equiper_theme, idArticles, 'equiper_theme'),
      created: createdAt, updated: updatedAt,
    });
    let points = Math.round(Number(u.points));
    if (!Number.isFinite(points) || points < 0) {
      avertir('valeur hors schéma remplacée (droits.points)');
      points = 0;
    }
    P.droits.run({
      user_id: u.id, admin: booleen(u.admin), points,
      abonnement: dansListe(u.abonnements, ABONNEMENTS, 'Gratuit', 'droits.abonnement'),
      verifie: booleen(u.verified), updated: updatedAt,
    });
  }

  // relations des utilisateurs
  for (const { u } of retenus) {
    for (const a of garder([...liste(u.possed_avatar_decoration), ...liste(u.possed_titre), ...liste(u.possed_theme)], idArticles, 'possession')) P.possession.run(u.id, a);
    for (const b of garder(liste(u.bar_favori), idBars, 'favori_bar')) P.favoriBar.run(u.id, b);
    for (const b of garder(liste(u.boisson_favori), idBoissons, 'favori_boisson')) P.favoriBoisson.run(u.id, b);
    for (const j of garder(liste(u.jeux_favori), idJeux, 'favori_jeu')) P.favoriJeu.run(u.id, j);
    for (const a of garder(liste(u.items_favori), idArticles, 'favori_article')) P.favoriArticle.run(u.id, a);
    for (const b of garder(liste(u.bar_decouver), idBars, 'bar_decouvert')) P.barDecouvert.run(u.id, b);
    for (const a of garder(liste(u.amies), idUsers, 'ami')) {
      if (a === u.id) { avertir('relation ignorée (auto-référence)'); continue; }
      P.ami.run(u.id, a);
    }
    // demande_amies : liste du DESTINATAIRE, éléments = expéditeurs (cf. src/js/amis.js)
    for (const e of garder(liste(u.demande_amies), idUsers, 'demande_ami')) {
      if (e === u.id) { avertir('relation ignorée (auto-référence)'); continue; }
      P.demandeAmi.run(u.id, e);
    }
    for (const s of garder(liste(u.demande_session), idSessions, 'invitation_session')) P.invitation.run(s, u.id);
  }

  // sessions
  for (const r of sessions) {
    P.session.run({
      id: r.id, nom: r.nom ?? null, description: r.description ?? null,
      date_depart: dateIso(r.date_heur_depart), date_arrivee: dateIso(r.date_heur_arriver),
      etat: r.etat_session ? dansListe(r.etat_session, ETATS, 'pas_commencer', 'session.etat') : 'pas_commencer',
      automatique: booleen(r.automatique),
      hote_id: garderUn(r.id_hote, idUsers, 'session.hote'),
      jeu_id: garderUn(r.id_jeux, idJeux, 'session.jeu'),
      created: dateIsoOuMaintenant(r.created), updated: dateIsoOuMaintenant(r.updated),
    });
    for (const m of garder(liste(r.id_menbre), idUsers, 'session_membre')) P.sessionMembre.run(r.id, m);
    for (const m of garder(liste(r.id_sam), idUsers, 'session_sam')) P.sessionSam.run(r.id, m);
    // id_bar : l'ordre du tableau = position du bar dans le parcours
    liste(r.id_bar).forEach((b, i) => {
      if (garderUn(b, idBars, 'session_bar')) P.sessionBar.run(r.id, b, i);
    });
  }
});

migrer();

// ---- Rapport ----------------------------------------------------------
const TABLES = ['user', 'profil', 'droits', 'bar', 'bar_image', 'boisson', 'bar_boisson', 'jeu', 'jeu_image', 'boutique',
  'question_quiz', 'possession', 'favori_bar', 'favori_boisson', 'favori_jeu', 'favori_article', 'bar_decouvert', 'ami',
  'demande_ami', 'session_barathon', 'session_membre', 'session_sam', 'session_bar', 'invitation_session', 'account'];
console.log('Lignes par table (base cible) :');
for (const t of TABLES) {
  console.log(`  ${t} : ${db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n}`); // t = constante du script
}
console.log(`Fichiers : ${fichiers.copies} copiés, ${fichiers.existants} déjà présents, ${fichiers.ignores} ignorés (format non géré), ${fichiers.absents} introuvables`);
if (avertissements.size) {
  console.log('Avertissements :');
  for (const [libelle, n] of avertissements) console.log(`  ${libelle} : ${n}`);
} else console.log('Avertissements : aucun');
console.log(`Contrôle des clés étrangères : ${db.pragma('foreign_key_check').length} violation(s)`);
console.log('Rappel : mots de passe non migrés (aucune ligne account).');

src.close();
db.close();
