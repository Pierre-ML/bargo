// =====================================================================
// BARGO : création de compte (partagée par /inscription et par
// /api/compte/inscription utilisée par la landing page).
// better-auth crée "user" + "account" ; le hook de auth.js crée profil +
// droits ; on complète ensuite le profil (liste blanche de db.ts).
// =====================================================================
import { auth } from './auth.js';
import { mettreAJourProfil } from './db.ts';

/**
 * @returns {Promise<{ ok: true, headers: Headers, userId: string } | { ok: false, status: number, error: string }>}
 */
export async function inscrire({ pseudo, email, password, passwordConfirm, profil = {}, headers }) {
  pseudo = String(pseudo ?? '').trim();
  email = String(email ?? '').trim();
  password = String(password ?? '');

  if (!pseudo || !email || !password) {
    return { ok: false, status: 400, error: 'Veuillez remplir tous les champs obligatoires.' };
  }
  if (pseudo.length > 50) {
    return { ok: false, status: 400, error: 'Le pseudo ne doit pas dépasser 50 caractères.' };
  }
  if (passwordConfirm !== undefined && password !== String(passwordConfirm)) {
    return { ok: false, status: 400, error: 'Les mots de passe ne correspondent pas.' };
  }
  if (password.length < 8) {
    return { ok: false, status: 400, error: 'Le mot de passe doit contenir au moins 8 caractères.' };
  }
  if (password.length > 128) {
    return { ok: false, status: 400, error: 'Le mot de passe ne doit pas dépasser 128 caractères.' };
  }

  try {
    const { headers: headersAuth, response } = await auth.api.signUpEmail({
      body: { name: pseudo, email, password },
      headers,
      returnHeaders: true,
    });
    const userId = response?.user?.id;
    if (!userId) throw new Error('Inscription sans utilisateur');

    // Champs facultatifs du formulaire (pseudo déjà posé par le hook)
    mettreAJourProfil(userId, { ...profil, pseudo });
    return { ok: true, headers: headersAuth, userId };
  } catch (e) {
    const code = e?.body?.code ?? '';
    if (code.startsWith('USER_ALREADY_EXISTS')) {
      return { ok: false, status: 422, error: 'Cette adresse e-mail est déjà utilisée.' };
    }
    if (code === 'INVALID_EMAIL') {
      return { ok: false, status: 400, error: 'Adresse e-mail invalide.' };
    }
    if (code.startsWith('PASSWORD_TOO')) {
      return { ok: false, status: 400, error: 'Le mot de passe doit contenir entre 8 et 128 caractères.' };
    }
    console.error('[inscription]', code || e);
    return { ok: false, status: 500, error: 'Une erreur est survenue lors de la création du compte.' };
  }
}
