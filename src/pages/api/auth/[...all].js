// Point d'entrée better-auth : toutes les routes /api/auth/* (connexion,
// inscription, session, déconnexion, changement de mot de passe...).
import { auth } from '../../../lib/auth.js';

export const prerender = false;

export const ALL = ({ request }) => auth.handler(request);
