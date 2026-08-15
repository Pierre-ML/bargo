// @ts-nocheck
// Système d'amis — modal recherche + demandes entrantes (profil)

(function () {
  var fd = document.getElementById('friend-data');
  if (!fd) return;
  var d        = JSON.parse(fd.textContent);
  var allUsers = d.allUsers;
  var amiesIds = d.amiesIds.slice();
  var userId   = d.userId;
  var TOKEN    = d.token;
  var PB_URL   = d.PB_URL;
  var sentRequests = [];

  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function imgUrl(rec, file) { return file ? PB_URL + '/api/files/' + rec.collectionName + '/' + rec.id + '/' + file : null; }
  function avatarHtml(user) {
    var url = imgUrl(user, user.avatar);
    if (url) return '<img src="' + url + '" alt="' + esc(user.pseudo) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />';
    var l = (user.pseudo || user.prenom || '?').charAt(0).toUpperCase();
    return '<div style="width:100%;height:100%;background:#347645;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:17px;">' + esc(l) + '</div>';
  }

  function renderFriendList(q) {
    q = (q || '').toLowerCase();
    var list = document.getElementById('friend-modal-list');
    if (!list) return;
    var filtered = allUsers.filter(function (u) {
      return !q || (u.pseudo + ' ' + u.prenom + ' ' + u.nom).toLowerCase().includes(q);
    });
    list.innerHTML = filtered.map(function (user) {
      var isAmi  = amiesIds.indexOf(user.id) >= 0;
      var isSent = sentRequests.indexOf(user.id) >= 0;
      var name   = esc(user.pseudo || (user.prenom + ' ' + (user.nom || '')).trim() || 'Utilisateur');
      var btnHtml;
      if (isAmi) {
        btnHtml = '<span style="font-size:13px;font-weight:500;color:#72c073;padding:0 4px;">Déjà ami</span>';
      } else if (isSent) {
        btnHtml = '<span style="font-size:13px;font-weight:500;color:rgba(247,241,237,0.5);padding:0 4px;">Demande envoyée</span>';
      } else {
        btnHtml = '<button data-action="send-request" data-id="' + user.id + '" style="height:32px;padding:0 16px;font-size:13px;font-weight:500;border:none;cursor:pointer;border-radius:3px;background:#347645;color:white;">Demander</button>';
      }
      return '<div style="display:flex;align-items:center;gap:14px;background:#2c2c2c;border-radius:5px;padding:12px;margin-bottom:8px;">' +
        '<div style="width:44px;height:44px;flex-shrink:0;border-radius:50%;overflow:hidden;">' + avatarHtml(user) + '</div>' +
        '<div style="flex:1;min-width:0;"><p style="color:white;font-size:14px;font-weight:500;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + name + '</p></div>' +
        btnHtml +
        '</div>';
    }).join('') || '<p style="color:rgba(247,241,237,0.5);font-size:14px;">Aucun résultat.</p>';

    list.querySelectorAll('[data-action="send-request"]').forEach(function (btn) {
      btn.addEventListener('click', function () { sendFriendRequest(btn.dataset.id); });
    });
  }

  async function sendFriendRequest(recipientId) {
    try {
      var res = await fetch(PB_URL + '/api/collections/users/records/' + recipientId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
        body: JSON.stringify({ 'demande_amies+': [userId] }),
      });
      if (res.ok) {
        sentRequests.push(recipientId);
        renderFriendList(document.getElementById('friend-search')?.value || '');
      }
    } catch (_) {}
  }

  // ── Modal open/close ──────────────────────────────────────────────
  function openFriendModal() {
    document.getElementById('friend-modal').style.display = 'flex';
    renderFriendList('');
  }
  document.getElementById('btn-open-friends')?.addEventListener('click', openFriendModal);
  document.getElementById('btn-open-friends-mob')?.addEventListener('click', openFriendModal);
  document.getElementById('friend-modal-close')?.addEventListener('click', function () {
    document.getElementById('friend-modal').style.display = 'none';
  });
  document.getElementById('friend-modal')?.addEventListener('click', function (e) {
    if (e.target === this) this.style.display = 'none';
  });
  document.getElementById('friend-search')?.addEventListener('input', function () {
    renderFriendList(this.value);
  });

  // ── Accepter / Refuser ────────────────────────────────────────────
  document.querySelectorAll('.friend-accept').forEach(function (btn) {
    var item     = btn.closest('.friend-request-item');
    var friendId = item && item.dataset.friendId;
    if (!friendId) return;
    btn.addEventListener('click', async function () {
      btn.disabled = true;
      try {
        await fetch(PB_URL + '/api/collections/users/records/' + userId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
          body: JSON.stringify({ 'amies+': [friendId], 'demande_amies-': [friendId] }),
        });
        await fetch(PB_URL + '/api/collections/users/records/' + friendId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
          body: JSON.stringify({ 'amies+': [userId] }),
        });
        amiesIds.push(friendId);
        item.remove();
        if (!document.querySelector('.friend-request-item')) {
          document.getElementById('friend-requests-section')?.remove();
        }
      } catch (_) { btn.disabled = false; }
    });
  });

  document.querySelectorAll('.friend-refuse').forEach(function (btn) {
    var item     = btn.closest('.friend-request-item');
    var friendId = item && item.dataset.friendId;
    if (!friendId) return;
    btn.addEventListener('click', async function () {
      btn.disabled = true;
      try {
        await fetch(PB_URL + '/api/collections/users/records/' + userId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
          body: JSON.stringify({ 'demande_amies-': [friendId] }),
        });
        item.remove();
        if (!document.querySelector('.friend-request-item')) {
          document.getElementById('friend-requests-section')?.remove();
        }
      } catch (_) { btn.disabled = false; }
    });
  });
  // ── Accepter une invitation de session ───────────────────────────
  document.querySelectorAll('.session-invite-accept').forEach(function (btn) {
    var item      = btn.closest('.session-invite-item');
    var sessionId = item && item.dataset.sessionId;
    var href      = btn.dataset.sessionHref;
    if (!sessionId) return;
    btn.addEventListener('click', async function () {
      btn.disabled = true;
      try {
        // Retirer de demande_session
        await fetch(PB_URL + '/api/collections/users/records/' + userId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
          body: JSON.stringify({ 'demande_session-': [sessionId] }),
        });
        // Ajouter l'utilisateur dans id_menbre de la session
        await fetch(PB_URL + '/api/collections/session_barathon/records/' + sessionId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
          body: JSON.stringify({ 'id_menbre+': [userId] }),
        });
        window.location.href = href;
      } catch (_) { btn.disabled = false; }
    });
  });

  // ── Refuser une invitation de session ────────────────────────────
  document.querySelectorAll('.session-invite-refuse').forEach(function (btn) {
    var item      = btn.closest('.session-invite-item');
    var sessionId = item && item.dataset.sessionId;
    if (!sessionId) return;
    btn.addEventListener('click', async function () {
      btn.disabled = true;
      try {
        await fetch(PB_URL + '/api/collections/users/records/' + userId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
          body: JSON.stringify({ 'demande_session-': [sessionId] }),
        });
        item.remove();
        if (!document.querySelector('.session-invite-item')) {
          document.getElementById('session-requests-section')?.remove();
        }
      } catch (_) { btn.disabled = false; }
    });
  });
})();
