// @ts-nocheck
// Système d'amis : modal de recherche, demandes entrantes, invitations de session.
// Tout passe par /api/amis, /api/utilisateurs/recherche et /api/invitations
// (session lue côté serveur dans le cookie httpOnly : aucun token côté client).

(function () {
  var amiesIds = [];
  var sentRequests = [];
  var chargeAmis = false;
  var timer = null;
  var AIDE = 'Saisis au moins 2 caractères pour chercher un utilisateur.';

  function post(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  // Éléments construits avec textContent : aucune donnée utilisateur n'est
  // insérée comme HTML.
  function el(tag, style, texte) {
    var e = document.createElement(tag);
    if (style) e.style.cssText = style;
    if (texte !== undefined) e.textContent = texte;
    return e;
  }

  function avatarNode(user) {
    var cadre = el('div', 'width:44px;height:44px;flex-shrink:0;border-radius:50%;overflow:hidden;');
    if (user.avatar) {
      var img = el('img', 'width:100%;height:100%;object-fit:cover;border-radius:50%;');
      img.src = user.avatar;
      img.alt = user.pseudo || '';
      cadre.appendChild(img);
    } else {
      var l = (user.pseudo || '?').charAt(0).toUpperCase();
      cadre.appendChild(el('div', 'width:100%;height:100%;background:#347645;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:17px;', l));
    }
    return cadre;
  }

  function message(list, texte) {
    list.replaceChildren(el('p', 'color:rgba(247,241,237,0.5);font-size:14px;', texte));
  }

  function renderResults(list, users) {
    if (!users.length) return message(list, 'Aucun résultat.');
    list.replaceChildren();
    users.forEach(function (user) {
      var isAmi  = user.ami || amiesIds.indexOf(user.id) >= 0;
      var isSent = user.envoyee || sentRequests.indexOf(user.id) >= 0;
      var ligne = el('div', 'display:flex;align-items:center;gap:14px;background:#2c2c2c;border-radius:5px;padding:12px;margin-bottom:8px;');
      ligne.appendChild(avatarNode(user));
      var nom = el('div', 'flex:1;min-width:0;');
      nom.appendChild(el('p', 'color:white;font-size:14px;font-weight:500;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;', user.pseudo || 'Utilisateur'));
      ligne.appendChild(nom);
      if (isAmi) {
        ligne.appendChild(el('span', 'font-size:13px;font-weight:500;color:#72c073;padding:0 4px;', 'Déjà ami'));
      } else if (isSent) {
        ligne.appendChild(el('span', 'font-size:13px;font-weight:500;color:rgba(247,241,237,0.5);padding:0 4px;', 'Demande envoyée'));
      } else {
        var btn = el('button', 'height:32px;padding:0 16px;font-size:13px;font-weight:500;border:none;cursor:pointer;border-radius:3px;background:#347645;color:white;', 'Demander');
        btn.type = 'button';
        btn.addEventListener('click', function () { sendFriendRequest(user, btn, users, list); });
        ligne.appendChild(btn);
      }
      list.appendChild(ligne);
    });
  }

  async function search(q) {
    var list = document.getElementById('friend-modal-list');
    if (!list) return;
    q = (q || '').trim();
    if (q.length < 2) return message(list, AIDE);
    try {
      var res = await fetch('/api/utilisateurs/recherche?q=' + encodeURIComponent(q));
      if (!res.ok) return message(list, 'Recherche impossible pour le moment.');
      var data = await res.json();
      // ignore une réponse périmée si la saisie a changé entre-temps
      var input = document.getElementById('friend-search');
      if (input && input.value.trim() !== q) return;
      renderResults(list, data.utilisateurs || []);
    } catch (_) {
      message(list, 'Recherche impossible pour le moment.');
    }
  }

  async function sendFriendRequest(user, btn, users, list) {
    btn.disabled = true;
    try {
      var res = await post('/api/amis/demande', { ami_id: user.id });
      if (res.ok) {
        var data = await res.json();
        if (data.etat === 'ami') amiesIds.push(user.id); else sentRequests.push(user.id);
        renderResults(list, users);
      } else {
        btn.disabled = false;
      }
    } catch (_) { btn.disabled = false; }
  }

  async function loadAmis() {
    if (chargeAmis) return;
    try {
      var res = await fetch('/api/amis');
      if (!res.ok) return;
      var data = await res.json();
      amiesIds = (data.amis || []).map(function (a) { return a.id; });
      sentRequests = (data.envoyees || []).map(function (a) { return a.id; });
      chargeAmis = true;
    } catch (_) {}
  }

  // ── Modal open/close ──────────────────────────────────────────────
  async function openFriendModal() {
    var modal = document.getElementById('friend-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    var input = document.getElementById('friend-search');
    if (input) input.value = '';
    var list = document.getElementById('friend-modal-list');
    if (list) message(list, AIDE);
    await loadAmis();
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
    var v = this.value;
    clearTimeout(timer);
    timer = setTimeout(function () { search(v); }, 250);
  });

  // ── Accepter / Refuser une demande d'ami ──────────────────────────
  function retirerDemande(item) {
    item.remove();
    if (!document.querySelector('.friend-request-item')) {
      document.getElementById('friend-requests-section')?.remove();
    }
  }

  document.querySelectorAll('.friend-accept').forEach(function (btn) {
    var item     = btn.closest('.friend-request-item');
    var friendId = item && item.dataset.friendId;
    if (!friendId) return;
    btn.addEventListener('click', async function () {
      btn.disabled = true;
      try {
        var res = await post('/api/amis/accepter', { ami_id: friendId });
        if (!res.ok) { btn.disabled = false; return; }
        amiesIds.push(friendId);
        retirerDemande(item);
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
        var res = await post('/api/amis/refuser', { ami_id: friendId });
        if (!res.ok) { btn.disabled = false; return; }
        retirerDemande(item);
      } catch (_) { btn.disabled = false; }
    });
  });

  // ── Invitations de session ────────────────────────────────────────
  document.querySelectorAll('.session-invite-accept').forEach(function (btn) {
    var item      = btn.closest('.session-invite-item');
    var sessionId = item && item.dataset.sessionId;
    var href      = btn.dataset.sessionHref;
    if (!sessionId) return;
    btn.addEventListener('click', async function () {
      btn.disabled = true;
      try {
        var res = await post('/api/invitations/repondre', { session_id: sessionId, accepter: true });
        if (!res.ok) { btn.disabled = false; return; }
        window.location.href = href;
      } catch (_) { btn.disabled = false; }
    });
  });

  document.querySelectorAll('.session-invite-refuse').forEach(function (btn) {
    var item      = btn.closest('.session-invite-item');
    var sessionId = item && item.dataset.sessionId;
    if (!sessionId) return;
    btn.addEventListener('click', async function () {
      btn.disabled = true;
      try {
        var res = await post('/api/invitations/repondre', { session_id: sessionId, accepter: false });
        if (!res.ok) { btn.disabled = false; return; }
        item.remove();
        if (!document.querySelector('.session-invite-item')) {
          document.getElementById('session-requests-section')?.remove();
        }
      } catch (_) { btn.disabled = false; }
    });
  });
})();
