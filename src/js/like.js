(function () {
  // Favoris : l'état initial vient du serveur (le cœur plein est déjà affiché
  // via la prop `liked` de LikeButton). Un clic appelle POST /api/favoris, qui
  // bascule le favori de l'utilisateur connecté (cookie de session).
  var authMeta = document.getElementById('auth-meta');
  var connecte = !!(authMeta && authMeta.dataset.userId);

  // Classe du bouton -> type attendu par /api/favoris
  var TYPES = { 'like-btn-bar': 'bar', 'like-btn-jeux': 'jeu', 'like-btn-item': 'article' };

  function afficher(btn, favori) {
    var emptyEl  = btn.querySelector('.like-empty');
    var filledEl = btn.querySelector('.like-filled');
    if (emptyEl)  emptyEl.classList.toggle('hidden', favori);
    if (filledEl) filledEl.classList.toggle('hidden', !favori);
  }

  function estFavori(btn) {
    var filledEl = btn.querySelector('.like-filled');
    return !!filledEl && !filledEl.classList.contains('hidden');
  }

  function basculer(btn, type) {
    var id = btn.dataset.id;
    if (!id) return;
    if (!connecte) {
      window.location.href = '/connexion?redirect=' + encodeURIComponent(window.location.pathname);
      return;
    }
    var avant = estFavori(btn);
    afficher(btn, !avant); // affichage immédiat, annulé en cas d'erreur
    btn.disabled = true;
    fetch('/api/favoris', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: type, id: id }),
    })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(function (data) { afficher(btn, data.favori === true); })
      .catch(function () { afficher(btn, avant); })
      .then(function () { btn.disabled = false; });
  }

  Object.keys(TYPES).forEach(function (classe) {
    document.querySelectorAll('.' + classe).forEach(function (btn) {
      if (btn.dataset.likeInit) return;
      btn.dataset.likeInit = '1';
      btn.addEventListener('click', function () { basculer(btn, TYPES[classe]); });
    });
  });
})();
