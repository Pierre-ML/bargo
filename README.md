# Projet collectif S.2

Éléménts à renseigner pour la soutenance :

- [ ] Nom du projet : bargo
- [ ] URL de la landing page : https://bargo.pierre-mouilleseaux-lhuillier.fr/LandingPage
- [ ] URL de l'application finale : https://bargo.pierre-mouilleseaux-lhuillier.fr/
- [ ] Description du projet : Bargo est une web app pensée pour organiser facilement des sorties entre amis.
Elle permet de créer une sortie, inviter des participants, choisir les informations importantes comme le lieu, la date, et centraliser toute l’organisation au même endroit. L’objectif est de simplifier la préparation d’une soirée ou d’un événement en groupe, sans avoir à tout gérer dans plusieurs conversations séparées. L’application ajoute aussi une dimension plus fun grâce à des mini-jeux intégrés, pensés pour animer la soirée et créer une expérience plus interactive entre les participants. L’objectif est de simplifier l’organisation tout en rendant la préparation d’une sortie plus conviviale et amusante.

## Base de données

### Pourquoi SQLite

BARGO utilise **SQLite** (via `better-sqlite3`), le modèle vu à l'école. La base tient dans un seul fichier, sans serveur à installer. Le SQL écrit est simple (pas de trigger, pas d'extension) : il est donc portable vers **Cloudflare D1**. L'ancienne base PocketBase a été remplacée.

### Schéma en résumé

| Table(s) | Rôle |
|---|---|
| `user`, `session`, `account`, `verification` | Comptes et connexions, gérés par better-auth (ne pas renommer). Le mot de passe haché est dans `account`. |
| `profil` | Ce que l'utilisateur peut modifier : pseudo, ville, avatar, réseaux, articles équipés. |
| `droits` | Ce que l'utilisateur ne peut PAS modifier : `admin`, `points`, `abonnement`, `verifie`. Seul le code serveur ou un admin y écrit. |
| `bar`, `bar_image`, `boisson`, `bar_boisson` | Catalogue des bars : images ordonnées, boissons servies (table de liaison). |
| `jeu`, `jeu_image`, `question_quiz` | Jeux et questions du quiz. |
| `boutique`, `possession` | Articles à vendre (décoration, thème, titre) et articles achetés. |
| `favori_bar`, `favori_boisson`, `favori_jeu`, `favori_article`, `bar_decouvert` | Favoris et bars découverts. |
| `ami`, `demande_ami` | Amitiés (une ligne par sens) et demandes en attente. |
| `notification` | Notifications d'un utilisateur. |
| `session_barathon`, `session_membre`, `session_sam`, `session_bar`, `invitation_session` | Sessions de barathon : membres, conducteurs désignés (SAM), parcours ordonné, invitations. |
| `partie` | Parties de jeux jouées (limite de points par jour). |

Relations principales : un `user` a un `profil` et une ligne `droits` (1 pour 1). Les autres tables pointent vers `user`, `bar`, `jeu` ou `boutique` par clés étrangères. Quand un compte ou un bar est supprimé, les lignes liées partent avec lui (`ON DELETE CASCADE`).

Dans `session_barathon`, `bar_actuel` indique le bar en cours dans le parcours, et `demarre_le` l'heure réelle de lancement. Les points de fin de session ne sont donnés que si la session a duré au moins 30 minutes.

### Fichiers

- `sql/schema.sql` : création des tables.
- `sql/seed.sql` : catalogue de départ (bars, jeux, boissons, boutique, quiz), sans donnée d'utilisateur.
- `sql/requetes.sql` : requêtes principales commentées (documentation uniquement).
- `src/lib/db.ts` : toutes les requêtes réellement exécutées par l'application.

La base est **créée automatiquement au premier démarrage** : `schema.sql` est lu, puis `seed.sql` seulement si la base est neuve.

### Variables d'environnement

Copier `.env.example` en `.env` puis le remplir (`.env` n'est jamais commité).

| Variable | Rôle |
|---|---|
| `DATABASE_PATH` | Fichier SQLite (défaut `data/bargo.db`). |
| `UPLOAD_DIR` | Dossier des images envoyées (défaut `data/uploads`). |
| `BETTER_AUTH_SECRET` | Secret qui signe les cookies de connexion. Obligatoire. |
| `BETTER_AUTH_URL` | URL publique du site (`http://localhost:4321` en local, `https://...` en production). |

Générer le secret :

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Ces variables sont lues **à l'exécution** (`getSecret`), jamais inscrites dans le build (`dist/`). Aucune ne commence par `PUBLIC_`.

### Commandes

```bash
npm install          # installer les dépendances
npm run dev          # serveur de développement (http://localhost:4321)
npm run build        # build de production dans dist/
node --env-file=.env scripts/migrer-pocketbase.mjs   # migration depuis PocketBase
```

La migration lit la copie de PocketBase en lecture seule (`copie-pb/pbbargo`, jamais commitée). Elle est relançable : les identifiants sont conservés, il n'y a pas de doublon. Attention, relancer écrase les lignes déjà migrées. Les mots de passe ne sont pas migrés.

Inspecter la base :

```bash
sqlite3 data/bargo.db "SELECT id, nom FROM bar;"
# sans sqlite3 :
node -e "const d=require('better-sqlite3')('data/bargo.db');console.log(d.prepare('SELECT id, nom FROM bar').all())"
```

### Authentification

La connexion utilise **better-auth** avec e-mail + mot de passe. La connexion Google et l'e-mail de réinitialisation du mot de passe ont été **retirés volontairement** (pour la durée de vie du site). Les comptes migrés de PocketBase n'ont pas de mot de passe : un admin en définit un **temporaire** depuis le panneau admin (la page affiche le mot de passe une seule fois), puis le transmet à la personne, qui peut ensuite le changer.

**Premier administrateur** : crée un compte sur `/inscription`, puis, sur le serveur :

```bash
node --env-file=.env scripts/promouvoir-admin.mjs ton-adresse@exemple.fr
# --retirer pour enlever le statut admin
```

### Images

Les images sont des fichiers dans `UPLOAD_DIR`, rangés par clé : `bar/<id>/img-0.webp`, `avatar/<id>/avatar-k3j9x2.webp`, etc. La base ne stocke que cette clé. La route `/fichiers/...` les sert : le catalogue (bar, boisson, jeu, boutique) est public, les avatars sont réservés aux utilisateurs connectés.

Pour passer à **Cloudflare R2**, il suffit de réécrire trois fonctions de `src/lib/stockage.js` : `lireFichier`, `ecrireFichier` et `supprimerFichier`. Le reste du code ne change pas.

### Déploiement sur le VPS (systemd)

Arborescence conseillée, avec `data/` et `.env` ignorés par git :

```
/srv/bargo/
├── .env          # variables d'environnement (droits restreints)
├── data/         # bargo.db et uploads/
├── dist/         # build
└── ...           # le dépôt
```

1. Récupérer le code dans `/srv/bargo`, puis construire sur le serveur (`better-sqlite3` est compilé pour la machine) :

```bash
cd /srv/bargo
npm ci && npm run build
```

2. Créer un utilisateur dédié et lui donner `data/` :

```bash
sudo useradd --system --home /srv/bargo --shell /usr/sbin/nologin bargo
sudo mkdir -p /srv/bargo/data
sudo chown -R bargo:bargo /srv/bargo/data
sudo chown root:bargo /srv/bargo/.env && sudo chmod 640 /srv/bargo/.env
```

Dans `.env`, mettre `DATABASE_PATH=/srv/bargo/data/bargo.db`, `UPLOAD_DIR=/srv/bargo/data/uploads` et `BETTER_AUTH_URL=https://` suivi du nom de domaine du site.

3. Fichier `/etc/systemd/system/bargo.service` :

```ini
[Unit]
Description=BARGO (Astro + SQLite)
After=network.target

[Service]
Type=simple
User=bargo
Group=bargo
WorkingDirectory=/srv/bargo
Environment=HOST=127.0.0.1
Environment=PORT=4321
ExecStart=/usr/bin/node --env-file=/srv/bargo/.env dist/server/entry.mjs
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/srv/bargo/data
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

4. Démarrer et surveiller :

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now bargo
sudo systemctl status bargo
journalctl -u bargo -f
```

5. **nginx** : le site écoute seulement sur `127.0.0.1:4321`. Un `server` HTTPS avec `location / { proxy_pass http://127.0.0.1:4321; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; }` suffit. Penser à `client_max_body_size 6m;` pour l'envoi d'images (5 Mo max).

6. **Migration, une seule fois**, avec la copie de PocketBase déposée dans `copie-pb/pbbargo` :

```bash
sudo -u bargo node --env-file=/srv/bargo/.env scripts/migrer-pocketbase.mjs
```

Ensuite, se connecter avec un compte admin et définir les mots de passe temporaires.

7. **Sauvegarde** de la base (copie cohérente, même si le site tourne) :

```bash
sqlite3 /srv/bargo/data/bargo.db ".backup /srv/bargo/data/sauvegarde.db"
# sans sqlite3 :
node -e "require('better-sqlite3')('/srv/bargo/data/bargo.db').backup('/srv/bargo/data/sauvegarde.db').then(()=>console.log('ok'))"
```

Sauvegarder aussi le dossier `data/uploads`.

8. Une fois la migration vérifiée (comptes, images, boutique), **arrêter puis supprimer l'ancien service PocketBase** :

```bash
sudo systemctl disable --now pocketbase   # nom du service à adapter
```

Puis supprimer son fichier d'unité et la variable `PB_URL` du `.env`.

### Vers Cloudflare

Le schéma est accepté tel quel par **D1** (pas de trigger, pas d'extension). Il faudrait changer :

- l'adaptateur Astro : `@astrojs/cloudflare` à la place de `@astrojs/node` ;
- `src/lib/db.ts` : D1 répond en asynchrone (`await env.DB.prepare(...).bind(...).all()`), donc les fonctions deviennent `async` et les transactions passent par `db.batch([...])` ;
- les fichiers : **R2** à la place du disque (voir la section Images) ;
- les secrets : variables du Worker à la place du fichier `.env`.

