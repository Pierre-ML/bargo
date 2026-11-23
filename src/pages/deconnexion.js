// Déconnexion : POST /deconnexion (formulaire), protégé par l'anti-CSRF du
// middleware. Supprime la session better-auth côté serveur, efface ses
// cookies, puis redirige.
import { auth } from '../lib/auth.js';
import { redirigerAvecCookies } from '../lib/api.js';

export const prerender = false;

const efface = (nom, secure = false) =>
  `${nom}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;

export async function POST({ request }) {
  let headers = null;
  const extra = [];
  try {
    ({ headers } = await auth.api.signOut({ headers: request.headers, returnHeaders: true }));
  } catch {
    // Pas de session valide : rien à révoquer, on efface quand même les cookies.
    const secure = new URL(request.url).protocol === 'https:';
    extra.push(efface('better-auth.session_token'), efface('better-auth.session_data'));
    if (secure) extra.push(efface('__Secure-better-auth.session_token', true), efface('__Secure-better-auth.session_data', true));
  }
  return redirigerAvecCookies('/connexion', headers, 302, extra);
}

// Un simple lien GET ne déconnecte pas (évite les déconnexions forcées par un site tiers).
export function GET() {
  return new Response(null, { status: 302, headers: { Location: '/profil' } });
}
