-- =====================================================================
-- BARGO : requêtes SQL principales (fichier DOCUMENTAIRE, pour l'école).
--
-- Ce fichier n'est lu par aucun programme. Les requêtes réellement
-- exécutées sont dans src/lib/db.ts (better-sqlite3, requêtes préparées).
-- Chaque "?" est un paramètre lié par le code : aucune valeur n'est jamais
-- collée dans le texte SQL.
-- Schéma : sql/schema.sql. Données de départ : sql/seed.sql.
--
-- Plan : 1 auth/droits, 2 catalogue, 3 profil, 4 amis, 5 favoris,
--        6 notifications, 7 sessions, 8 boutique, 9 jeux/quiz, 10 admin.
-- =====================================================================


-- =====================================================================
-- 1. AUTHENTIFICATION ET DROITS
-- Les comptes sont dans "user" / "account" (gérés par better-auth).
-- Les droits (admin, points...) sont dans "droits" : jamais modifiables
-- par l'utilisateur, seulement par du code serveur.
-- =====================================================================

-- Création du profil et des droits d'un nouveau compte (sans doublon).
INSERT OR IGNORE INTO profil (user_id, pseudo) VALUES (?, ?);
INSERT OR IGNORE INTO droits (user_id) VALUES (?);

-- Droits d'un utilisateur (lus à chaque requête par le middleware).
SELECT admin, points, abonnement, verifie FROM droits WHERE user_id = ?;

-- Ajouter (ou retirer si le nombre est négatif) des points, sans jamais
-- descendre sous 0. Si 0 ligne est modifiée, l'opération est refusée.
UPDATE droits SET points = points + ?, updated = ? WHERE user_id = ? AND points + ? >= 0;

-- Changer l'abonnement (Gratuit, VIP ou Premium) : code serveur seulement.
UPDATE droits SET abonnement = ?, updated = ? WHERE user_id = ?;


-- =====================================================================
-- 2. CATALOGUE PUBLIC (bars, jeux, boissons)
-- =====================================================================

-- Liste des bars avec leur première image (sous-requête corrélée).
SELECT b.*,
       (SELECT bi.fichier FROM bar_image bi
        WHERE bi.bar_id = b.id AND bi.type = 'img'
        ORDER BY bi.position LIMIT 1) AS image
FROM bar b
ORDER BY b.created;

-- Détail d'un bar : ses images (vignettes puis galerie, dans l'ordre).
SELECT type, fichier FROM bar_image WHERE bar_id = ? ORDER BY type, position;

-- Détail d'un bar : ses boissons (jointure par la table de liaison).
SELECT bo.id, bo.nom, bo.image
FROM bar_boisson bb
JOIN boisson bo ON bo.id = bb.boisson_id
WHERE bb.bar_id = ?
ORDER BY bo.nom;

-- Page de jeux : total pour la pagination, puis une page de résultats.
SELECT COUNT(*) AS n FROM jeu;
SELECT j.*,
       (SELECT ji.fichier FROM jeu_image ji
        WHERE ji.jeu_id = j.id ORDER BY ji.position LIMIT 1) AS image
FROM jeu j
ORDER BY j.created
LIMIT ? OFFSET ?;


-- =====================================================================
-- 3. PROFIL
-- =====================================================================

-- Profil public d'un utilisateur : jamais l'e-mail. Les articles équipés
-- (décoration, titre, thème) sont trois jointures sur la même table boutique.
SELECT p.user_id AS id, p.pseudo, p.prenom, p.nom, p.age, p.ville,
       p.avatar, p.description, p.insta, p.facebook, p.discord,
       d.abonnement, d.points, d.verifie,
       deco.id AS deco_id, deco.nom AS deco_nom, deco.image AS deco_image,
       ti.id AS titre_id, ti.nom AS titre_nom, ti.titre AS titre_texte,
       th.id AS theme_id, th.nom AS theme_nom, th.image AS theme_image
FROM profil p
LEFT JOIN droits d      ON d.user_id = p.user_id
LEFT JOIN boutique deco ON deco.id = p.equipe_decoration_id
LEFT JOIN boutique ti   ON ti.id   = p.equipe_titre_id
LEFT JOIN boutique th   ON th.id   = p.equipe_theme_id
WHERE p.user_id = ?;

-- Mise à jour du profil. Seules les colonnes d'une liste blanche fixe
-- (pseudo, prenom, nom, age, ville, description, insta, facebook, discord,
-- avatar) peuvent apparaître ici ; les droits ne sont jamais touchés.
UPDATE profil SET pseudo = ?, ville = ?, updated = ? WHERE user_id = ?;

-- Articles possédés par l'utilisateur (jointure possession + boutique).
SELECT b.id, b.nom, b.type, b.image, b.titre
FROM possession p JOIN boutique b ON b.id = p.article_id
WHERE p.user_id = ?
ORDER BY b.type, b.nom;

-- Compteurs de la page "Mon profil".
SELECT COUNT(*) AS n FROM session_barathon WHERE hote_id = ?;
SELECT COUNT(*) AS n FROM session_membre WHERE user_id = ?;

-- Suppression d'un compte : les ON DELETE CASCADE effacent profil, droits,
-- sessions de connexion, amis, favoris, notifications, etc.
DELETE FROM "user" WHERE id = ?;


-- =====================================================================
-- 4. AMIS
-- "ami" contient une ligne par sens (A->B et B->A).
-- "demande_ami" contient les demandes en attente.
-- =====================================================================

-- Liste de mes amis (profil + décoration d'avatar équipée).
SELECT p.user_id AS id, p.pseudo, p.prenom, p.nom, p.avatar,
       deco.image AS decoration
FROM ami a
JOIN profil p ON p.user_id = a.ami_id
LEFT JOIN boutique deco ON deco.id = p.equipe_decoration_id
WHERE a.user_id = ?
ORDER BY p.pseudo;

-- Demandes d'ami que j'ai reçues.
SELECT p.user_id AS id, p.pseudo, p.avatar
FROM demande_ami d
JOIN profil p ON p.user_id = d.expediteur_id
WHERE d.destinataire_id = ?
ORDER BY d.created DESC;

-- Envoyer une demande (une seule par couple grâce à la clé primaire).
INSERT OR IGNORE INTO demande_ami (destinataire_id, expediteur_id, created) VALUES (?, ?, ?);

-- Accepter une demande : TRANSACTION (tout ou rien).
--   1. vérifier que la demande existe ;
--   2. créer l'amitié dans les deux sens ;
--   3. supprimer les demandes entre les deux personnes.
BEGIN;
SELECT 1 FROM demande_ami WHERE destinataire_id = ? AND expediteur_id = ?;
INSERT OR IGNORE INTO ami (user_id, ami_id, created) VALUES (?, ?, ?);
INSERT OR IGNORE INTO ami (user_id, ami_id, created) VALUES (?, ?, ?);
DELETE FROM demande_ami
WHERE (destinataire_id = ? AND expediteur_id = ?)
   OR (destinataire_id = ? AND expediteur_id = ?);
COMMIT;

-- Recherche d'une personne par pseudo (20 résultats au plus, moi exclu).
-- ESCAPE permet de chercher un vrai "%" ou "_" tapé par l'utilisateur.
SELECT p.user_id AS id, p.pseudo, p.avatar, deco.image AS decoration
FROM profil p
LEFT JOIN boutique deco ON deco.id = p.equipe_decoration_id
WHERE p.user_id <> ? AND p.pseudo LIKE ? ESCAPE '\'
ORDER BY p.pseudo
LIMIT 20;


-- =====================================================================
-- 5. FAVORIS
-- Quatre tables identiques : favori_bar, favori_boisson, favori_jeu,
-- favori_article. Exemple avec les bars.
-- =====================================================================

-- Bascule d'un favori (en transaction) : on tente de supprimer ; si rien
-- n'a été supprimé, on ajoute.
DELETE FROM favori_bar WHERE user_id = ? AND bar_id = ?;
INSERT INTO favori_bar (user_id, bar_id) VALUES (?, ?);

-- Bars favoris d'un utilisateur, avec leur image.
SELECT b.id, b.nom,
       (SELECT bi.fichier FROM bar_image bi
        WHERE bi.bar_id = b.id AND bi.type = 'img'
        ORDER BY bi.position LIMIT 1) AS image
FROM favori_bar f JOIN bar b ON b.id = f.bar_id
WHERE f.user_id = ?
ORDER BY b.nom;


-- =====================================================================
-- 6. NOTIFICATIONS
-- =====================================================================

-- Les 20 dernières notifications.
SELECT id, texte, lu, created FROM notification
WHERE user_id = ?
ORDER BY created DESC LIMIT 20;

-- Nombre de notifications non lues (pastille de la cloche).
SELECT COUNT(*) AS n FROM notification WHERE user_id = ? AND lu = 0;

-- Tout marquer comme lu (la clause user_id empêche de toucher celles des autres).
UPDATE notification SET lu = 1 WHERE user_id = ? AND lu = 0;


-- =====================================================================
-- 7. SESSIONS DE BARATHON
-- Tables : session_barathon (la session), session_membre, session_sam,
-- session_bar (parcours ordonné), invitation_session (invités en attente).
-- Colonnes de suivi : bar_actuel (index du bar en cours dans le parcours)
-- et demarre_le (heure réelle de lancement, texte ISO). Les points de fin
-- de session ne sont donnés que si la session a duré au moins 30 minutes.
-- =====================================================================

-- Mes sessions non terminées (hôte ou membre), avec le nombre de bars et
-- de membres et l'image du premier bar du parcours.
SELECT s.id, s.nom, s.date_depart, s.etat, s.hote_id,
       (SELECT COUNT(*) FROM session_bar sb WHERE sb.session_id = s.id) AS nb_bars,
       (SELECT COUNT(*) FROM session_membre sm WHERE sm.session_id = s.id) AS nb_membres,
       (SELECT bi.fichier FROM bar_image bi
        WHERE bi.type = 'img'
          AND bi.bar_id = (SELECT sb.bar_id FROM session_bar sb
                           WHERE sb.session_id = s.id ORDER BY sb.position LIMIT 1)
        ORDER BY bi.position LIMIT 1) AS image_bar
FROM session_barathon s
WHERE s.etat <> 'fini'
  AND (s.hote_id = ?
       OR EXISTS (SELECT 1 FROM session_membre m
                  WHERE m.session_id = s.id AND m.user_id = ?))
ORDER BY s.created DESC;

-- Parcours d'une session : session + bars dans l'ordre (jointure session_bar + bar).
SELECT b.id, b.nom, b.adresse, b.latitude, b.longitude,
       (SELECT bi.fichier FROM bar_image bi
        WHERE bi.bar_id = b.id AND bi.type = 'img'
        ORDER BY bi.position LIMIT 1) AS image
FROM session_bar sb JOIN bar b ON b.id = sb.bar_id
WHERE sb.session_id = ?
ORDER BY sb.position;

-- Membres d'une session (jointure session_membre + profil).
SELECT p.user_id AS id, p.pseudo, p.prenom, p.nom, p.avatar
FROM session_membre m JOIN profil p ON p.user_id = m.user_id
WHERE m.session_id = ?
ORDER BY p.pseudo;

-- Création d'une session : TRANSACTION (la session, son parcours, les
-- invitations et les SAM sont créés ensemble ou pas du tout).
BEGIN;
INSERT INTO session_barathon (id, nom, description, date_depart, date_arrivee, etat, automatique, hote_id, jeu_id, bar_actuel, created, updated)
VALUES (?, ?, ?, ?, ?, 'pas_commencer', ?, ?, ?, 0, ?, ?);
INSERT INTO session_bar (session_id, bar_id, position) VALUES (?, ?, ?);
INSERT INTO invitation_session (session_id, user_id, created) VALUES (?, ?, ?);
INSERT INTO session_sam (session_id, user_id) VALUES (?, ?);
COMMIT;

-- Accepter une invitation : TRANSACTION (supprimer l'invitation, puis
-- ajouter le membre).
BEGIN;
DELETE FROM invitation_session WHERE session_id = ? AND user_id = ?;
INSERT OR IGNORE INTO session_membre (session_id, user_id) VALUES (?, ?);
COMMIT;

-- Lancer la session : seulement si elle n'a pas encore commencé.
-- (demarre_le : heure de lancement, ajoutée par la mise à jour du schéma.)
UPDATE session_barathon
SET etat = 'en_cours', bar_actuel = 0, demarre_le = ?, updated = ?
WHERE id = ? AND etat = 'pas_commencer';

-- Passer au bar suivant, sans dépasser le dernier bar du parcours.
UPDATE session_barathon SET bar_actuel = bar_actuel + 1, updated = ?
WHERE id = ? AND etat = 'en_cours'
  AND bar_actuel + 1 < (SELECT COUNT(*) FROM session_bar WHERE session_id = ?);

-- Terminer la session : l'UPDATE ne réussit que pour une session en cours,
-- donc les points ne peuvent être donnés qu'une seule fois (dans la même
-- transaction). Ensuite le code lit ce qu'il faut pour calculer les gains
-- (5 points par bar visité, +50 pour un SAM, +30 pour l'hôte, multipliés
-- par l'abonnement : VIP x2, Premium x5).
BEGIN;
UPDATE session_barathon SET etat = 'fini', updated = ? WHERE id = ? AND etat = 'en_cours';
SELECT hote_id, bar_actuel, demarre_le FROM session_barathon WHERE id = ?;
SELECT COUNT(*) AS n FROM session_bar WHERE session_id = ?;
SELECT user_id FROM session_sam WHERE session_id = ?;
SELECT abonnement FROM droits WHERE user_id = ?;
UPDATE droits SET points = points + ?, updated = ? WHERE user_id = ? AND points + ? >= 0;
COMMIT;

-- Classement de fin de session : membres triés par points.
SELECT p.user_id AS id, p.pseudo, p.avatar, COALESCE(d.points, 0) AS points
FROM session_membre m
JOIN profil p ON p.user_id = m.user_id
LEFT JOIN droits d ON d.user_id = m.user_id
WHERE m.session_id = ?
ORDER BY points DESC;


-- =====================================================================
-- 8. BOUTIQUE
-- =====================================================================

-- Articles d'un type, avec l'état de l'utilisateur : possédé, équipé, favori.
-- EXISTS renvoie 1 ou 0 ; CASE teste si l'article est dans un des 3 emplacements.
SELECT b.id, b.nom, b.prix, b.type, b.image, b.titre,
       EXISTS(SELECT 1 FROM possession po
              WHERE po.user_id = ? AND po.article_id = b.id) AS possede,
       CASE WHEN b.id IN (pr.equipe_decoration_id, pr.equipe_titre_id, pr.equipe_theme_id)
            THEN 1 ELSE 0 END AS equipe,
       EXISTS(SELECT 1 FROM favori_article fa
              WHERE fa.user_id = ? AND fa.article_id = b.id) AS favori
FROM boutique b
LEFT JOIN profil pr ON pr.user_id = ?
WHERE b.type = ?
ORDER BY b.created, b.id
LIMIT ? OFFSET ?;

-- ACHAT D'UN ARTICLE : TRANSACTION.
--   1. l'article existe et a un prix ;
--   2. il n'est pas déjà possédé ;
--   3. débit CONDITIONNEL : l'UPDATE ne change aucune ligne si les points
--      sont insuffisants (le code annule alors tout) ;
--   4. enregistrement de la possession (la clé primaire interdit un doublon).
-- Si une étape échoue, rien n'est enregistré : pas de points perdus.
BEGIN;
SELECT id, prix FROM boutique WHERE id = ?;
SELECT 1 FROM possession WHERE user_id = ? AND article_id = ?;
UPDATE droits SET points = points - ?, updated = ? WHERE user_id = ? AND points >= ?;
INSERT INTO possession (user_id, article_id) VALUES (?, ?);
SELECT points FROM droits WHERE user_id = ?;
COMMIT;

-- Équiper un article possédé (exemple : une décoration d'avatar).
-- Le code choisit la colonne d'après le type de l'article, jamais le client.
UPDATE profil SET equipe_decoration_id = ?, updated = ? WHERE user_id = ?;

-- Retirer l'article équipé d'un type.
UPDATE profil SET equipe_titre_id = NULL, updated = ? WHERE user_id = ?;


-- =====================================================================
-- 9. JEUX ET QUIZ
-- =====================================================================

-- Dix questions de quiz au hasard parmi certains thèmes.
SELECT * FROM question_quiz WHERE theme IN (?, ?) ORDER BY RANDOM() LIMIT ?;

-- Fin d'une partie : TRANSACTION. Le serveur limite le score (barème par
-- jeu), impose 10 secondes entre deux parties et un plafond de points par jour.
BEGIN;
SELECT created FROM partie WHERE user_id = ? ORDER BY created DESC LIMIT 1;
SELECT COALESCE(SUM(points), 0) AS total FROM partie WHERE user_id = ? AND created >= ?;
INSERT INTO partie (id, user_id, jeu, score, points, created) VALUES (?, ?, ?, ?, ?, ?);
UPDATE droits SET points = points + ?, updated = ? WHERE user_id = ? AND points + ? >= 0;
COMMIT;


-- =====================================================================
-- 10. ADMINISTRATION (réservée aux comptes admin = 1)
-- =====================================================================

-- Liste des comptes avec leurs droits ; EXISTS indique si un mot de passe
-- est défini (utile pour les comptes migrés de PocketBase).
SELECT u.id, u.email, u.name, u.createdAt,
       p.pseudo, p.prenom, p.nom,
       d.admin, d.points, d.abonnement, d.verifie,
       EXISTS (SELECT 1 FROM account a
               WHERE a.userId = u.id AND a.providerId = 'credential'
                 AND a.password IS NOT NULL) AS a_mot_de_passe
FROM "user" u
LEFT JOIN profil p ON p.user_id = u.id
LEFT JOIN droits d ON d.user_id = u.id
ORDER BY u.createdAt;

-- Donner le rôle admin (ou le retirer avec 0).
UPDATE droits SET admin = ?, updated = ? WHERE user_id = ?;

-- Créer ou modifier une boisson (upsert : INSERT, ou UPDATE si l'id existe).
-- COALESCE garde l'ancienne image si aucune nouvelle n'est envoyée.
INSERT INTO boisson (id, nom, image, created, updated) VALUES (?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET nom = excluded.nom,
  image = COALESCE(excluded.image, boisson.image), updated = excluded.updated;

-- Créer ou modifier un article de la boutique (upsert).
INSERT INTO boutique (id, nom, prix, type, image, titre, created, updated)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET nom = excluded.nom, prix = excluded.prix,
  type = excluded.type, image = excluded.image, titre = excluded.titre,
  updated = excluded.updated;

-- Remplacer les boissons d'un bar : TRANSACTION (on efface, puis on relie
-- seulement les boissons qui existent vraiment).
BEGIN;
DELETE FROM bar_boisson WHERE bar_id = ?;
INSERT OR IGNORE INTO bar_boisson (bar_id, boisson_id)
SELECT ?, id FROM boisson WHERE id = ?;
COMMIT;

-- Supprimer un bar : les images, liens boissons, favoris et étapes de
-- session partent en cascade. Le code lit d'abord les fichiers à effacer.
SELECT fichier FROM bar_image WHERE bar_id = ?;
DELETE FROM bar WHERE id = ?;

-- Créer ou modifier une question de quiz (upsert, une seule bonne réponse).
INSERT INTO question_quiz (id, theme, question,
  choix_1, reponse_1, choix_2, reponse_2, choix_3, reponse_3, choix_4, reponse_4,
  created, updated)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET theme = excluded.theme, question = excluded.question,
  choix_1 = excluded.choix_1, reponse_1 = excluded.reponse_1,
  choix_2 = excluded.choix_2, reponse_2 = excluded.reponse_2,
  choix_3 = excluded.choix_3, reponse_3 = excluded.reponse_3,
  choix_4 = excluded.choix_4, reponse_4 = excluded.reponse_4,
  updated = excluded.updated;
