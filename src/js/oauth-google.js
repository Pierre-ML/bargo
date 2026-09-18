// Authentification Google via PocketBase OAuth2 (PKCE)
// Le navigateur ne parle jamais directement à PocketBase : /api/pb relaie
// vers PB_URL (privé) côté serveur.

document.querySelectorAll('.btn-google-oauth').forEach(btn => {
  btn.addEventListener('click', async () => {
    btn.disabled = true;

    try {
      const redirectUrl = window.location.origin + '/oauth2-redirect';

      const res  = await fetch(
        '/api/pb/collections/users/auth-methods?redirectUrl=' + encodeURIComponent(redirectUrl)
      );
      const data = await res.json();
      const google = data.authProviders?.find(p => p.name === 'google');

      if (!google) throw new Error('Google non disponible');

      // sessionStorage persiste dans le même onglet à travers les redirections
      sessionStorage.setItem('pb_oauth_state',    google.state);
      sessionStorage.setItem('pb_oauth_verifier', google.codeVerifier);
      sessionStorage.setItem('pb_oauth_redirect', redirectUrl);

      window.location.href = google.authUrl + encodeURIComponent(redirectUrl);

    } catch {
      btn.disabled = false;
    }
  });
});
