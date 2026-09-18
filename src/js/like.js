(function () {
  // Le navigateur ne parle jamais directement à PocketBase : /api/pb relaie
  // vers PB_URL (privé) côté serveur, et lit le token depuis le cookie httpOnly.
  var authMeta = document.getElementById('auth-meta');
  var userId = (authMeta && authMeta.dataset.userId) || null;

  var favs = { bar_favori: [], jeux_favori: [], items_favori: [] };

  // ── Init tous les boutons ───────────────────────────────────────
  function initBtns() {
    document.querySelectorAll('.like-btn-bar').forEach(function (btn) {
      var id       = btn.dataset.id;
      var emptyEl  = btn.querySelector('.like-empty');
      var filledEl = btn.querySelector('.like-filled');
      if (favs.bar_favori.indexOf(id) >= 0) {
        emptyEl && emptyEl.classList.add('hidden');
        filledEl && filledEl.classList.remove('hidden');
      }
      btn.addEventListener('click', function () {
        toggleLike('bar_favori', id, emptyEl, filledEl);
      });
    });

    document.querySelectorAll('.like-btn-jeux').forEach(function (btn) {
      var id       = btn.dataset.id;
      var emptyEl  = btn.querySelector('.like-empty');
      var filledEl = btn.querySelector('.like-filled');
      if (favs.jeux_favori.indexOf(id) >= 0) {
        emptyEl && emptyEl.classList.add('hidden');
        filledEl && filledEl.classList.remove('hidden');
      }
      btn.addEventListener('click', function () {
        toggleLike('jeux_favori', id, emptyEl, filledEl);
      });
    });

    document.querySelectorAll('.like-btn-item').forEach(function (btn) {
      var id       = btn.dataset.id;
      var emptyEl  = btn.querySelector('.like-empty');
      var filledEl = btn.querySelector('.like-filled');
      if (favs.items_favori.indexOf(id) >= 0) {
        emptyEl  && emptyEl.classList.add('hidden');
        filledEl && filledEl.classList.remove('hidden');
      }
      btn.addEventListener('click', function () {
        toggleLike('items_favori', id, emptyEl, filledEl);
      });
    });
  }

  // ── Toggle ──────────────────────────────────────────────────────
  function toggleLike(field, itemId, emptyEl, filledEl) {
    var current = favs[field] || [];
    var idx     = current.indexOf(itemId);
    var updated;

    if (idx >= 0) {
      updated = current.filter(function (id) { return id !== itemId; });
      emptyEl  && emptyEl.classList.remove('hidden');
      filledEl && filledEl.classList.add('hidden');
    } else {
      updated = current.concat([itemId]);
      emptyEl  && emptyEl.classList.add('hidden');
      filledEl && filledEl.classList.remove('hidden');
    }
    favs[field] = updated;

    if (!userId) return; // pas connecté : toggle visuel seulement

    var body = {};
    body[field] = updated;

    fetch('/api/pb/collections/users/records/' + userId, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    }).catch(function () {
      // revert on error
      favs[field] = current;
      if (idx >= 0) {
        emptyEl  && emptyEl.classList.add('hidden');
        filledEl && filledEl.classList.remove('hidden');
      } else {
        emptyEl  && emptyEl.classList.remove('hidden');
        filledEl && filledEl.classList.add('hidden');
      }
    });
  }

  // ── Charge les favoris existants si connecté ───────────────────
  if (userId) {
    fetch('/api/pb/collections/users/records/' + userId)
    .then(function (r) { return r.ok ? r.json() : {}; })
    .then(function (user) {
      favs.bar_favori   = Array.isArray(user.bar_favori)   ? user.bar_favori   : [];
      favs.jeux_favori  = Array.isArray(user.jeux_favori)  ? user.jeux_favori  : [];
      favs.items_favori = Array.isArray(user.items_favori) ? user.items_favori : [];
      initBtns();
    })
    .catch(initBtns);
  } else {
    initBtns();
  }
})();
