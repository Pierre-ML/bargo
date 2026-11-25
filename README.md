# Projet collectif S.2

Éléménts à renseigner pour la soutenance :

- [ ] Nom du projet : bargo
- [ ] URL de la landing page : https://bargo.pierre-mouilleseaux-lhuillier.fr/LandingPage
- [ ] URL de l'application finale : https://bargo.pierre-mouilleseaux-lhuillier.fr/
- [ ] Description du projet : Bargo est une web app pensée pour organiser facilement des sorties entre amis.
Elle permet de créer une sortie, inviter des participants, choisir les informations importantes comme le lieu, la date, et centraliser toute l’organisation au même endroit. L’objectif est de simplifier la préparation d’une soirée ou d’un événement en groupe, sans avoir à tout gérer dans plusieurs conversations séparées. L’application ajoute aussi une dimension plus fun grâce à des mini-jeux intégrés, pensés pour animer la soirée et créer une expérience plus interactive entre les participants. L’objectif est de simplifier l’organisation tout en rendant la préparation d’une sortie plus conviviale et amusante.



## Déploiement Cloudflare

Le site tourne sur Cloudflare Workers ; PocketBase reste la base de données (https://pbbargo.pierre-mouilleseaux-lhuillier.fr).

- Première fois : `npx wrangler login`
- Déployer : `npm run deploy` (build Astro puis `wrangler deploy`)
- Test local du Worker : `npm run preview`
- Domaine personnalisé : à lier dans le tableau de bord Cloudflare (Workers & Pages, bargo, Settings, Domains & Routes)
- `PB_URL` est lue au build (valeur par défaut dans `astro.config.mjs`, surchargeable via `.env`). Jamais de préfixe `PUBLIC_`.
