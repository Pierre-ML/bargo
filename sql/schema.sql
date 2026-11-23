-- =====================================================================
-- BARGO : schéma SQLite (compatible Cloudflare D1)
-- Conventions : identifiants TEXT, dates en texte ISO 8601 UTC,
-- booléens en INTEGER 0/1, clés de fichiers du type "bar/<id>/img-0.webp".
-- Pas de trigger, pas d'extension : portable vers D1.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Authentification : tables gérées par better-auth (ne pas renommer)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "user" (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL DEFAULT 0,
  image         TEXT,
  createdAt     DATE NOT NULL,
  updatedAt     DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS "session" (
  id        TEXT PRIMARY KEY,
  expiresAt DATE NOT NULL,
  token     TEXT NOT NULL UNIQUE,
  createdAt DATE NOT NULL,
  updatedAt DATE NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  userId    TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_session_user ON "session"(userId);

CREATE TABLE IF NOT EXISTS "account" (
  id                    TEXT PRIMARY KEY,
  accountId             TEXT NOT NULL,
  providerId            TEXT NOT NULL,
  userId                TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  accessToken           TEXT,
  refreshToken          TEXT,
  idToken               TEXT,
  accessTokenExpiresAt  DATE,
  refreshTokenExpiresAt DATE,
  scope                 TEXT,
  password              TEXT,
  createdAt             DATE NOT NULL,
  updatedAt             DATE NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_account_user ON "account"(userId);

CREATE TABLE IF NOT EXISTS "verification" (
  id         TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value      TEXT NOT NULL,
  expiresAt  DATE NOT NULL,
  createdAt  DATE,
  updatedAt  DATE
);
CREATE INDEX IF NOT EXISTS idx_verification_identifier ON "verification"(identifier);

-- ---------------------------------------------------------------------
-- 2. Catalogue (lecture publique, écriture admin)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bar (
  id                TEXT PRIMARY KEY,
  nom               TEXT NOT NULL,
  description       TEXT NOT NULL DEFAULT '',
  adresse           TEXT,
  latitude          REAL,
  longitude         REAL,
  liens             TEXT,
  specialites       TEXT,
  disponibilite     TEXT,
  contact           TEXT,
  horaires_lundi    TEXT,
  horaires_mardi    TEXT,
  horaires_mercredi TEXT,
  horaires_jeudi    TEXT,
  horaires_vendredi TEXT,
  horaires_samedi   TEXT,
  horaires_dimanche TEXT,
  created TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Images d'un bar : type 'img' (vignettes) ou 'galerie', dans l'ordre "position"
CREATE TABLE IF NOT EXISTS bar_image (
  bar_id   TEXT NOT NULL REFERENCES bar(id) ON DELETE CASCADE,
  type     TEXT NOT NULL CHECK (type IN ('img','galerie')),
  position INTEGER NOT NULL,
  fichier  TEXT NOT NULL,
  PRIMARY KEY (bar_id, type, position)
);

CREATE TABLE IF NOT EXISTS boisson (
  id      TEXT PRIMARY KEY,
  nom     TEXT,
  image   TEXT,
  created TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS bar_boisson (
  bar_id     TEXT NOT NULL REFERENCES bar(id) ON DELETE CASCADE,
  boisson_id TEXT NOT NULL REFERENCES boisson(id) ON DELETE CASCADE,
  PRIMARY KEY (bar_id, boisson_id)
);
CREATE INDEX IF NOT EXISTS idx_bar_boisson_boisson ON bar_boisson(boisson_id);

CREATE TABLE IF NOT EXISTS jeu (
  id          TEXT PRIMARY KEY,
  nom         TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type        TEXT CHECK (type IN ('questionaire','memorie','reflex','rythme')),
  created TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS jeu_image (
  jeu_id   TEXT NOT NULL REFERENCES jeu(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  fichier  TEXT NOT NULL,
  PRIMARY KEY (jeu_id, position)
);

-- Articles de la boutique : image (décoration d'avatar ou thème) ou titre (texte)
CREATE TABLE IF NOT EXISTS boutique (
  id      TEXT PRIMARY KEY,
  nom     TEXT,
  prix    INTEGER NOT NULL DEFAULT 0 CHECK (prix >= 0),
  type    TEXT NOT NULL CHECK (type IN ('theme','titre','decoration_avatar')),
  image   TEXT,
  titre   TEXT,
  created TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_boutique_type ON boutique(type);

CREATE TABLE IF NOT EXISTS question_quiz (
  id        TEXT PRIMARY KEY,
  theme     TEXT CHECK (theme IN ('jeux_video','histoire','cultrue_g')),
  question  TEXT,
  choix_1   TEXT, reponse_1 INTEGER NOT NULL DEFAULT 0,
  choix_2   TEXT, reponse_2 INTEGER NOT NULL DEFAULT 0,
  choix_3   TEXT, reponse_3 INTEGER NOT NULL DEFAULT 0,
  choix_4   TEXT, reponse_4 INTEGER NOT NULL DEFAULT 0,
  created TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_question_theme ON question_quiz(theme);

-- ---------------------------------------------------------------------
-- 3. Utilisateurs : profil (modifiable par l'utilisateur) et droits
--    (JAMAIS modifiables par l'utilisateur : code serveur ou admin seulement)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profil (
  user_id              TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  pseudo               TEXT,
  prenom               TEXT,
  nom                  TEXT,
  age                  INTEGER,
  ville                TEXT,
  description          TEXT,
  insta                TEXT,
  facebook             TEXT,
  discord              TEXT,
  avatar               TEXT,
  equipe_decoration_id TEXT REFERENCES boutique(id) ON DELETE SET NULL,
  equipe_titre_id      TEXT REFERENCES boutique(id) ON DELETE SET NULL,
  equipe_theme_id      TEXT REFERENCES boutique(id) ON DELETE SET NULL,
  created TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS droits (
  user_id    TEXT PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  admin      INTEGER NOT NULL DEFAULT 0 CHECK (admin IN (0,1)),
  points     INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  abonnement TEXT NOT NULL DEFAULT 'Gratuit' CHECK (abonnement IN ('Gratuit','VIP','Premium')),
  verifie    INTEGER NOT NULL DEFAULT 0 CHECK (verifie IN (0,1)),
  updated TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Articles achetés (écriture uniquement par la route d'achat côté serveur)
CREATE TABLE IF NOT EXISTS possession (
  user_id    TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  article_id TEXT NOT NULL REFERENCES boutique(id) ON DELETE CASCADE,
  created TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, article_id)
);
CREATE INDEX IF NOT EXISTS idx_possession_article ON possession(article_id);

-- Favoris et bars découverts
CREATE TABLE IF NOT EXISTS favori_bar (
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  bar_id  TEXT NOT NULL REFERENCES bar(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, bar_id)
);
CREATE TABLE IF NOT EXISTS favori_boisson (
  user_id    TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  boisson_id TEXT NOT NULL REFERENCES boisson(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, boisson_id)
);
CREATE TABLE IF NOT EXISTS favori_jeu (
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  jeu_id  TEXT NOT NULL REFERENCES jeu(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, jeu_id)
);
CREATE TABLE IF NOT EXISTS favori_article (
  user_id    TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  article_id TEXT NOT NULL REFERENCES boutique(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, article_id)
);
CREATE TABLE IF NOT EXISTS bar_decouvert (
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  bar_id  TEXT NOT NULL REFERENCES bar(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, bar_id)
);

-- Amis : une ligne par sens (comme les listes PocketBase "amies")
CREATE TABLE IF NOT EXISTS ami (
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  ami_id  TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  created TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, ami_id),
  CHECK (user_id <> ami_id)
);
CREATE INDEX IF NOT EXISTS idx_ami_ami ON ami(ami_id);

-- Demande d'ami en attente : expediteur -> destinataire
CREATE TABLE IF NOT EXISTS demande_ami (
  destinataire_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  expediteur_id   TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  created TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (destinataire_id, expediteur_id),
  CHECK (destinataire_id <> expediteur_id)
);
CREATE INDEX IF NOT EXISTS idx_demande_ami_expediteur ON demande_ami(expediteur_id);

CREATE TABLE IF NOT EXISTS notification (
  id      TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  texte   TEXT NOT NULL,
  lu      INTEGER NOT NULL DEFAULT 0 CHECK (lu IN (0,1)),
  created TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_notification_user ON notification(user_id, lu);

-- ---------------------------------------------------------------------
-- 4. Sessions de barathon
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS session_barathon (
  id           TEXT PRIMARY KEY,
  nom          TEXT,
  description  TEXT,
  date_depart  TEXT,
  date_arrivee TEXT,
  etat         TEXT NOT NULL DEFAULT 'pas_commencer' CHECK (etat IN ('pas_commencer','en_cours','fini')),
  automatique  INTEGER NOT NULL DEFAULT 0 CHECK (automatique IN (0,1)),
  hote_id      TEXT REFERENCES "user"(id) ON DELETE CASCADE,
  jeu_id       TEXT REFERENCES jeu(id) ON DELETE SET NULL,
  bar_actuel   INTEGER NOT NULL DEFAULT 0 CHECK (bar_actuel >= 0),
  demarre_le   TEXT,
  created TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_session_barathon_hote ON session_barathon(hote_id);

CREATE TABLE IF NOT EXISTS session_membre (
  session_id TEXT NOT NULL REFERENCES session_barathon(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  PRIMARY KEY (session_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_session_membre_user ON session_membre(user_id);

-- SAM = conducteurs désignés de la session
CREATE TABLE IF NOT EXISTS session_sam (
  session_id TEXT NOT NULL REFERENCES session_barathon(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  PRIMARY KEY (session_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_session_sam_user ON session_sam(user_id);

-- Parcours : bars de la session dans l'ordre "position"
CREATE TABLE IF NOT EXISTS session_bar (
  session_id TEXT NOT NULL REFERENCES session_barathon(id) ON DELETE CASCADE,
  bar_id     TEXT NOT NULL REFERENCES bar(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, bar_id)
);
CREATE INDEX IF NOT EXISTS idx_session_bar_bar ON session_bar(bar_id);

-- Invitation en attente (ancien champ users.demande_session)
CREATE TABLE IF NOT EXISTS invitation_session (
  session_id TEXT NOT NULL REFERENCES session_barathon(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  created TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (session_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_invitation_session_user ON invitation_session(user_id);

-- ---------------------------------------------------------------------
-- 5. Parties de jeux : trace des points accordés par le serveur
--    (plafond quotidien et délai minimum entre deux parties)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS partie (
  id      TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  jeu     TEXT NOT NULL,
  score   INTEGER NOT NULL DEFAULT 0,
  points  INTEGER NOT NULL DEFAULT 0,
  created TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_partie_user_created ON partie(user_id, created);
