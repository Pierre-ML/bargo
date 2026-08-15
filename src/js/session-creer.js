// @ts-nocheck
(function () {
  var d        = JSON.parse(document.getElementById('app-data').textContent);
  var allBars  = d.bars;
  var allJeux  = d.jeux;
  var allUsers = d.users;
  var PB_URL   = d.PB_URL;
  var TOKEN    = d.token;
  var USER_ID  = d.userId;
  var barFavori = d.barFavori || [];

  var currentStep        = 1;
  var selectedBars       = [];
  var selectedJeux       = [];
  var selectedAmis       = [];
  var showFavsOnly       = false;
  var amiesIds           = d.amiesIds ? d.amiesIds.slice() : [];
  var sentFriendRequests = [];

  var stepMeta = {
    1: { title: 'Informations<br>de la soiree', progress: 0 },
    2: { title: 'Choisir<br>mes bars',          progress: 35 },
    3: { title: 'Choisir<br>mes jeux',          progress: 65 },
    4: { title: 'Inviter<br>mes amis',          progress: 95 },
  };

  // ── Helpers ───────────────────────────────────────────────────────
  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function imgUrl(rec, file) {
    return file ? PB_URL + '/api/files/' + rec.collectionName + '/' + rec.id + '/' + file : null;
  }
  function thumb(url, alt) {
    if (!url) return '<div style="width:100%;height:100%;background:#e7e5e5;border-radius:5px 0 0 5px;"></div>';
    return '<img src="' + url + '" alt="' + esc(alt) + '" style="width:100%;height:100%;object-fit:cover;" />';
  }
  var iconPlus = '<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="10" stroke="#1e1e1e" stroke-width="1.5"/><path d="M11 7v8M7 11h8" stroke="#1e1e1e" stroke-width="1.5" stroke-linecap="round"/></svg>';
  var iconCheck = '<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="11" fill="#72c073"/><path d="M6 11l4 4 6-6" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function avatarHtml(user) {
    var url = imgUrl(user, user.avatar);
    if (url) return '<img src="' + url + '" alt="' + esc(user.pseudo) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />';
    var l = (user.pseudo || user.prenom || '?').charAt(0).toUpperCase();
    return '<div style="width:100%;height:100%;background:#347645;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:17px;">' + esc(l) + '</div>';
  }
  function updateCount(elId, n, sing, plur) {
    var el = document.getElementById(elId);
    if (el) el.textContent = n + ' ' + (n <= 1 ? sing : plur);
  }
  function showError(msg) {
    var t = document.getElementById('error-toast');
    t.textContent    = msg;
    t.style.display  = 'block';
    setTimeout(function () { t.style.display = 'none'; }, 4000);
  }

  // ── Navigation ────────────────────────────────────────────────────
  window.goToStep = function (step) {
    document.getElementById('panel-' + currentStep).style.display = 'none';
    currentStep = step;
    document.getElementById('panel-' + step).style.display = 'flex';
    var m = stepMeta[step];
    document.getElementById('left-title').innerHTML     = m.title;
    document.getElementById('progress-bar').style.width = m.progress + '%';
    refreshCircles();
    if (step === 2) renderBars();
    if (step === 3) renderJeux();
    if (step === 4) renderUsers();
  };

  function refreshCircles() {
    var circles = document.querySelectorAll('.step-circle');
    var lines   = document.querySelectorAll('.step-line');
    circles.forEach(function (el) {
      var s   = parseInt(el.dataset.step);
      var num = el.querySelector('.step-num');
      var chk = el.querySelector('.step-check');
      if (s < currentStep) {
        el.style.background  = '#72c073'; el.style.borderColor = '#72c073';
        num.style.display = 'none';  chk.style.display = 'block'; chk.style.color = 'white';
      } else if (s === currentStep) {
        el.style.background  = 'white'; el.style.borderColor = 'white';
        num.style.display = 'block'; num.style.color = '#094736'; chk.style.display = 'none';
      } else {
        el.style.background  = 'transparent'; el.style.borderColor = 'rgba(255,255,255,0.3)';
        num.style.display = 'block'; num.style.color = 'rgba(255,255,255,0.3)'; chk.style.display = 'none';
      }
    });
    // connector lines: green if both sides are completed
    lines.forEach(function (line, i) {
      line.style.background = (i < currentStep - 1) ? '#72c073' : 'rgba(255,255,255,0.25)';
    });
  }

  function refreshSummary() {
    var el = document.getElementById('left-summary');
    var items = [];
    if (selectedBars.length) items.push('<span style="color:#72c073;font-size:13px;font-weight:500;">🍺 ' + selectedBars.length + ' bar' + (selectedBars.length > 1 ? 's' : '') + '</span>');
    if (selectedJeux.length) items.push('<span style="color:#72c073;font-size:13px;font-weight:500;">🎮 ' + selectedJeux.length + ' jeu' + (selectedJeux.length > 1 ? 'x' : '') + '</span>');
    if (selectedAmis.length) items.push('<span style="color:#72c073;font-size:13px;font-weight:500;">👥 ' + selectedAmis.length + ' ami' + (selectedAmis.length > 1 ? 's' : '') + '</span>');
    if (items.length) { el.innerHTML = items.join(''); el.style.display = 'flex'; }
    else { el.style.display = 'none'; }
  }

  // ── Bars ──────────────────────────────────────────────────────────
  function renderBars(q) {
    q = (q || '').toLowerCase();
    var list = document.getElementById('bars-list');
    var base = showFavsOnly ? allBars.filter(function (b) { return barFavori.indexOf(b.id) >= 0; }) : allBars;
    var filtered = base.filter(function (b) { return !q || b.nom.toLowerCase().includes(q) || b.adresse.toLowerCase().includes(q); });
    list.innerHTML = filtered.map(function (bar) {
      var sel = selectedBars.some(function (b) { return b.id === bar.id; });
      return '<div style="display:flex;align-items:center;background:white;border:2px solid #dfdfdf;border-radius:5px;box-shadow:0 4px 4px rgba(0,0,0,0.25);padding:10px;gap:8px;">' +
        '<div style="width:120px;height:75px;flex-shrink:0;border-radius:5px 0 0 5px;overflow:hidden;">' + thumb(imgUrl(bar, bar.img), bar.nom) + '</div>' +
        '<div style="flex:1;min-width:0;"><p style="color:#000;font-size:16px;font-weight:500;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(bar.nom) + '</p><p style="color:#646262;font-size:14px;font-weight:500;margin:4px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(bar.adresse) + '</p></div>' +
        '<button data-action="toggle-bar" data-id="' + bar.id + '" style="flex-shrink:0;padding:0 12px;height:37px;background:white;border:2px solid ' + (sel ? '#72c073' : '#dfdfdf') + ';border-radius:5px;box-shadow:0 4px 4px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;gap:6px;cursor:pointer;font-size:13px;font-weight:500;color:#1e1e1e;">Ajouter ' + (sel ? iconCheck : iconPlus) + '</button>' +
      '</div>';
    }).join('');
    list.querySelectorAll('[data-action="toggle-bar"]').forEach(function (btn) {
      btn.addEventListener('click', function () { toggleBar(btn.dataset.id); renderBars(document.getElementById('search-bars').value); });
    });
    refreshBarsSummary();
  }
  function refreshBarsSummary() {
    var box = document.getElementById('bars-summary-box');
    var countEl = document.getElementById('bars-count');
    var namesEl = document.getElementById('bars-names');
    if (!box) return;
    box.style.display = selectedBars.length ? 'block' : 'none';
    if (countEl) countEl.textContent = 'Bars sélectionnés : ' + selectedBars.length;
    if (namesEl) namesEl.textContent = selectedBars.map(function(b){ return b.nom; }).join(' , ');
  }
  function toggleBar(id) {
    var idx = selectedBars.findIndex(function (b) { return b.id === id; });
    if (idx >= 0) selectedBars.splice(idx, 1);
    else { var b = allBars.find(function (b) { return b.id === id; }); if (b) selectedBars.push(b); }
    refreshBarsSummary();
  }

  // ── Jeux ──────────────────────────────────────────────────────────
  // id_jeux est Single dans PocketBase → un seul jeu à la fois
  function renderJeux(q) {
    q = (q || '').toLowerCase();
    var list = document.getElementById('jeux-list');
    var filtered = allJeux.filter(function (j) { return !q || j.nom.toLowerCase().includes(q); });
    list.innerHTML = filtered.map(function (jeu) {
      var sel = selectedJeux.length > 0 && selectedJeux[0].id === jeu.id;
      return '<div style="display:flex;align-items:center;background:white;border:2px solid #dfdfdf;border-radius:5px;box-shadow:0 4px 4px rgba(0,0,0,0.25);padding:10px;gap:8px;">' +
        '<div style="width:120px;height:75px;flex-shrink:0;border-radius:5px 0 0 5px;overflow:hidden;">' + thumb(imgUrl(jeu, jeu.img), jeu.nom) + '</div>' +
        '<div style="flex:1;min-width:0;"><p style="color:#000;font-size:16px;font-weight:500;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(jeu.nom) + '</p></div>' +
        '<button data-action="toggle-jeu" data-id="' + jeu.id + '" style="flex-shrink:0;width:141px;height:37px;background:white;border:2px solid ' + (sel ? '#72c073' : '#dfdfdf') + ';border-radius:5px;box-shadow:0 4px 4px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;font-size:14px;font-weight:500;color:#1e1e1e;">Ajouter ' + (sel ? iconCheck : iconPlus) + '</button>' +
      '</div>';
    }).join('');
    list.querySelectorAll('[data-action="toggle-jeu"]').forEach(function (btn) {
      btn.addEventListener('click', function () { toggleJeu(btn.dataset.id); renderJeux(document.getElementById('search-jeux').value); });
    });
    refreshJeuxSummary();
  }
  function refreshJeuxSummary() {
    var box = document.getElementById('jeux-summary-box');
    var countEl = document.getElementById('jeux-count');
    var namesEl = document.getElementById('jeux-names');
    if (!box) return;
    box.style.display = selectedJeux.length ? 'block' : 'none';
    if (countEl) countEl.textContent = selectedJeux.length > 0 ? 'Jeux sélectionnés : 1' : 'Jeux sélectionnés : 0';
    if (namesEl) namesEl.textContent = selectedJeux.length > 0 ? selectedJeux[0].nom : '';
  }
  function toggleJeu(id) {
    if (selectedJeux.length > 0 && selectedJeux[0].id === id) {
      selectedJeux = [];
    } else {
      var j = allJeux.find(function (j) { return j.id === id; });
      selectedJeux = j ? [j] : [];
    }
    refreshJeuxSummary();
  }

  // ── Users ─────────────────────────────────────────────────────────
  function renderUsers(q) {
    q = (q || '').toLowerCase();
    var list = document.getElementById('users-list');
    var filtered = allUsers.filter(function (u) { return !q || (u.pseudo + ' ' + u.prenom + ' ' + u.nom).toLowerCase().includes(q); });
    list.innerHTML = filtered.map(function (user) {
      var ami  = selectedAmis.find(function (a) { return a.id === user.id; });
      var sel  = !!ami; var isSam = ami && ami.sam;
      var name = esc(user.pseudo || (user.prenom + ' ' + user.nom).trim() || 'Utilisateur');
      var isAmi   = amiesIds.indexOf(user.id) >= 0;
      var isSent  = sentFriendRequests.indexOf(user.id) >= 0;
      var friendBtn = isAmi
        ? '<span style="font-size:12px;font-weight:600;color:#72c073;padding:0 8px;">Ami(e)</span>'
        : isSent
        ? '<span style="font-size:12px;font-weight:500;color:#646262;padding:0 8px;">Demandé</span>'
        : '<button data-action="add-friend" data-id="'+user.id+'" style="height:37px;padding:0 14px;font-size:13px;font-weight:500;cursor:pointer;border-radius:5px;background:white;color:#347645;border:2px solid #347645;box-shadow:0 4px 4px rgba(0,0,0,0.25);">+ Ami</button>';
      return '<div style="background:white;border:2px solid #dfdfdf;border-radius:5px;box-shadow:0 4px 4px rgba(0,0,0,0.25);">' +
        // MOBILE
        '<div class="block lg:hidden" style="padding:12px;">' +
          '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">' +
            '<div style="width:44px;height:44px;flex-shrink:0;border-radius:50%;overflow:hidden;">' + avatarHtml(user) + '</div>' +
            '<div style="flex:1;min-width:0;">' +
              '<p style="color:#000;font-size:15px;font-weight:500;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + name + '</p>' +
              (user.pseudo && (user.prenom || user.nom) ? '<p style="color:#646262;font-size:13px;font-weight:500;margin:2px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc((user.prenom + ' ' + user.nom).trim()) + '</p>' : '') +
            '</div>' +
          '</div>' +
          '<div style="display:flex;gap:8px;align-items:center;">' +
            '<button data-action="toggle-ami" data-id="' + user.id + '" style="flex:1;height:36px;background:white;border:2px solid ' + (sel ? '#72c073' : '#dfdfdf') + ';border-radius:5px;box-shadow:0 2px 4px rgba(0,0,0,0.15);display:flex;align-items:center;justify-content:center;gap:6px;cursor:pointer;font-size:13px;font-weight:500;color:#1e1e1e;">Ajouter ' + (sel ? iconCheck : iconPlus) + '</button>' +
            '<button data-action="toggle-sam" data-id="' + user.id + '" style="height:36px;padding:0 16px;font-size:13px;font-weight:500;cursor:pointer;border-radius:5px;background:white;color:#1e1e1e;border:2px solid ' + (isSam ? '#347645' : '#dfdfdf') + ';box-shadow:0 2px 4px rgba(0,0,0,0.15);">SAM</button>' +
            friendBtn +
          '</div>' +
        '</div>' +
        // DESKTOP (original)
        '<div class="hidden lg:block" style="padding:14px;">' +
          '<div style="display:flex;align-items:center;gap:14px;">' +
            '<div style="width:55px;height:55px;flex-shrink:0;border-radius:50%;overflow:hidden;">' + avatarHtml(user) + '</div>' +
            '<div style="flex:1;min-width:0;"><p style="color:#000;font-size:16px;font-weight:500;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + name + '</p>' +
            (user.pseudo && (user.prenom || user.nom) ? '<p style="color:#646262;font-size:14px;font-weight:500;margin:2px 0 0;">' + esc((user.prenom + ' ' + user.nom).trim()) + '</p>' : '') + '</div>' +
            '<div style="display:flex;gap:8px;flex-shrink:0;align-items:center;">' +
              '<button data-action="toggle-ami" data-id="' + user.id + '" style="width:141px;height:37px;background:white;border:2px solid ' + (sel ? '#72c073' : '#dfdfdf') + ';border-radius:5px;box-shadow:0 4px 4px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;font-size:14px;font-weight:500;color:#1e1e1e;">Ajouter ' + (sel ? iconCheck : iconPlus) + '</button>' +
              '<button data-action="toggle-sam" data-id="' + user.id + '" style="height:37px;padding:0 18px;font-size:14px;font-weight:500;cursor:pointer;border-radius:5px;background:white;color:#1e1e1e;border:2px solid ' + (isSam ? '#347645' : '#dfdfdf') + ';box-shadow:0 4px 4px rgba(0,0,0,0.25);">SAM</button>' +
              friendBtn +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');
    list.querySelectorAll('[data-action="toggle-ami"]').forEach(function (btn) {
      btn.addEventListener('click', function () { toggleAmi(btn.dataset.id); renderUsers(document.getElementById('search-users').value); });
    });
    list.querySelectorAll('[data-action="toggle-sam"]').forEach(function (btn) {
      btn.addEventListener('click', function () { toggleSam(btn.dataset.id); renderUsers(document.getElementById('search-users').value); });
    });
    list.querySelectorAll('[data-action="add-friend"]').forEach(function (btn) {
      btn.addEventListener('click', function () { sendFriendRequest(btn.dataset.id); });
    });
    refreshUsersSummary();
  }
  function refreshUsersSummary() {
    var box = document.getElementById('users-summary-box');
    var countEl = document.getElementById('users-count');
    var namesEl = document.getElementById('users-names');
    if (!box) return;
    box.style.display = selectedAmis.length ? 'block' : 'none';
    if (countEl) countEl.textContent = 'Amis sélectionnés : ' + selectedAmis.length;
    if (namesEl) namesEl.textContent = selectedAmis.map(function(a){ return a.pseudo || (a.prenom + ' ' + a.nom).trim(); }).join(' , ');
  }
  function toggleAmi(id) {
    var idx = selectedAmis.findIndex(function (a) { return a.id === id; });
    if (idx >= 0) selectedAmis.splice(idx, 1);
    else { var u = allUsers.find(function (u) { return u.id === id; }); if (u) selectedAmis.push(Object.assign({}, u, { sam: false })); }
    refreshUsersSummary();
  }
  function toggleSam(id) {
    var ami = selectedAmis.find(function (a) { return a.id === id; });
    if (ami) { ami.sam = !ami.sam; }
    else { var u = allUsers.find(function (u) { return u.id === id; }); if (u) { selectedAmis.push(Object.assign({}, u, { sam: true })); refreshUsersSummary(); } }
  }

  // ── Friend request ────────────────────────────────────────────────
  async function sendFriendRequest(recipientId) {
    try {
      var res = await fetch(PB_URL+'/api/collections/users/records/'+recipientId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer '+TOKEN },
        body: JSON.stringify({ 'demande_amies+': [USER_ID] }),
      });
      if (res.ok) {
        sentFriendRequests.push(recipientId);
        renderUsers(document.getElementById('search-users').value);
      }
    } catch(_) {}
  }

  // ── Date/time helpers ─────────────────────────────────────────────
  function toMinutes(timeStr) {
    var p = (timeStr || '').split(':');
    return parseInt(p[0] || 0) * 60 + parseInt(p[1] || 0);
  }
  function buildDatetime(dateStr, timeStr, extraDays) {
    if (!dateStr || !timeStr) return null;
    var d = new Date(dateStr + 'T00:00:00');
    if (extraDays) d.setDate(d.getDate() + extraDays);
    var y  = d.getFullYear();
    var mo = String(d.getMonth() + 1).padStart(2, '0');
    var da = String(d.getDate()).padStart(2, '0');
    return y + '-' + mo + '-' + da + ' ' + timeStr + ':00';
  }

  // ── Save & launch ─────────────────────────────────────────────────
  async function saveSession() {
    var nom = document.getElementById('s1-nom').value.trim();
    if (!nom) { showError('Veuillez donner un nom au barathon.'); goToStep(1); return; }

    var btn = document.getElementById('btn-lancer');
    btn.disabled    = true;
    btn.textContent = 'Création…';

    var dateStr    = document.getElementById('s1-date').value        || '';
    var heureDebStr = document.getElementById('s1-heure-debut').value || '';
    var heureFinStr = document.getElementById('s1-heure-fin').value   || '';

    // Si l'heure de fin est avant l'heure de départ → la fin est le lendemain
    var finAddDay = (dateStr && heureDebStr && heureFinStr && toMinutes(heureFinStr) < toMinutes(heureDebStr)) ? 1 : 0;

    var payload = {
      nom:               nom,
      date_heur_depart:  buildDatetime(dateStr, heureDebStr, 0),
      date_heur_arriver: buildDatetime(dateStr, heureFinStr, finAddDay),
      description:  document.getElementById('s1-desc').value        || null,
      id_hote:      USER_ID,
      id_bar:       selectedBars.map(function (b) { return b.id; }),
      id_jeux:      selectedJeux.length > 0 ? selectedJeux[0].id : null,
      id_menbre:    [],
      id_sam:       selectedAmis.filter(function (a) { return a.sam; }).map(function (a) { return a.id; }),
      etat_session: 'pas_commencer',
      automatique:  false,
    };

    try {
      var res = await fetch(PB_URL + '/api/collections/session_barathon/records', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
        body:    JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Erreur ' + res.status);
      var session = await res.json();

      // Envoyer une invitation de session à chaque ami invité
      for (var i = 0; i < selectedAmis.length; i++) {
        try {
          var uRes = await fetch(PB_URL + '/api/collections/users/records/' + selectedAmis[i].id, {
            headers: { Authorization: 'Bearer ' + TOKEN }
          });
          if (uRes.ok) {
            var uData = await uRes.json();
            var existing = Array.isArray(uData.demande_session) ? uData.demande_session : [];
            if (existing.indexOf(session.id) < 0) {
              existing.push(session.id);
              await fetch(PB_URL + '/api/collections/users/records/' + selectedAmis[i].id, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
                body: JSON.stringify({ demande_session: existing }),
              });
            }
          }
        } catch(_) {}
      }

      window.location.href = '/session/' + session.id;
    } catch (err) {
      showError('Impossible de créer la session. Vérifiez votre connexion.');
      btn.disabled    = false;
      btn.textContent = 'Lancer 🚀';
    }
  }

  // ── Events ────────────────────────────────────────────────────────
  document.getElementById('btn-next-1').addEventListener('click', function () { goToStep(2); });
  document.getElementById('btn-lancer').addEventListener('click', saveSession);
  document.getElementById('search-bars').addEventListener('input',  function () { renderBars(this.value); });
  document.getElementById('search-jeux').addEventListener('input',  function () { renderJeux(this.value); });
  document.getElementById('search-users').addEventListener('input', function () { renderUsers(this.value); });
  document.getElementById('btn-favoris-bars').addEventListener('click', function () {
    showFavsOnly = !showFavsOnly;
    this.style.background = showFavsOnly ? '#094736' : '#347645';
    renderBars(document.getElementById('search-bars').value);
  });

  // ── Date & Time Pickers ───────────────────────────────────────────
  var MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  var DAYS_FR   = ['lu','ma','me','je','ve','sa','di'];
  var pickerOpen = null;
  var calYear, calMonth, calSelected = null;
  (function() { var n = new Date(); calYear = n.getFullYear(); calMonth = n.getMonth(); })();
  var timeVals = { 'heure-debut': { h: null, m: null }, 'heure-fin': { h: null, m: null } };

  window.togglePicker = function(type) {
    if (pickerOpen === type) { closePickers(); return; }
    closePickers();
    pickerOpen = type;
    if (type === 'date') renderCal();
    else renderTime(type);
    document.getElementById(type === 'date' ? 'date-popup' : type + '-popup').style.display = 'block';
  };
  function closePickers() {
    ['date-popup','heure-debut-popup','heure-fin-popup'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    pickerOpen = null;
  }
  document.addEventListener('click', function(e) {
    if (!pickerOpen) return;
    var inDate  = e.target.closest && (e.target.closest('#date-popup') || e.target.closest('[onclick*="date"]'));
    var inDeb   = e.target.closest && (e.target.closest('#heure-debut-popup') || e.target.closest('[onclick*="heure-debut"]'));
    var inFin   = e.target.closest && (e.target.closest('#heure-fin-popup')   || e.target.closest('[onclick*="heure-fin"]'));
    if (!inDate && !inDeb && !inFin) closePickers();
  });

  function renderCal() {
    var popup = document.getElementById('date-popup');
    var today = new Date();
    var first = new Date(calYear, calMonth, 1);
    var last  = new Date(calYear, calMonth + 1, 0);
    var startDow = (first.getDay() + 6) % 7;
    var h = '';
    // Header
    h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">';
    h += '<button type="button" onclick="window.calNav(event,-1)" style="background:none;border:none;cursor:pointer;padding:4px;border-radius:50%;color:#1e1e1e;line-height:1;">';
    h += '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M10 12L6 8l4-4" stroke="#1e1e1e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
    h += '<span style="font-size:14px;font-weight:700;color:#1e1e1e;">' + MONTHS_FR[calMonth] + ' ' + calYear + '</span>';
    h += '<button type="button" onclick="window.calNav(event,1)" style="background:none;border:none;cursor:pointer;padding:4px;border-radius:50%;color:#1e1e1e;line-height:1;">';
    h += '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="#1e1e1e" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
    h += '</div>';
    // Day headers
    h += '<div style="display:grid;grid-template-columns:repeat(7,1fr);margin-bottom:4px;">';
    DAYS_FR.forEach(function(d) { h += '<div style="font-size:11px;font-weight:600;color:#646262;text-align:center;padding:3px 0;">' + d + '</div>'; });
    h += '</div>';
    // Days
    h += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;">';
    for (var i = 0; i < startDow; i++) h += '<div></div>';
    for (var d = 1; d <= last.getDate(); d++) {
      var isToday = (d === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear());
      var isSel   = calSelected && (d === calSelected.getDate() && calMonth === calSelected.getMonth() && calYear === calSelected.getFullYear());
      h += '<button type="button" onclick="window.calSelect(' + d + ')" style="'
        + 'background:' + (isSel ? '#72c073' : 'transparent') + ';'
        + 'color:' + (isSel ? 'white' : '#1e1e1e') + ';'
        + 'border:' + (isToday && !isSel ? '1.5px solid #094736' : '1.5px solid transparent') + ';'
        + 'border-radius:50%;width:32px;height:32px;margin:auto;display:flex;align-items:center;justify-content:center;'
        + 'font-size:13px;font-weight:500;cursor:pointer;">' + d + '</button>';
    }
    h += '</div>';
    popup.innerHTML = h;
  }
  window.calNav = function(e, dir) {
    e.stopPropagation();
    calMonth += dir;
    if (calMonth < 0)  { calMonth = 11; calYear--; }
    if (calMonth > 11) { calMonth = 0;  calYear++; }
    renderCal();
  };
  window.calSelect = function(day) {
    calSelected = new Date(calYear, calMonth, day);
    var dd = String(day).padStart(2,'0');
    var mm = String(calMonth + 1).padStart(2,'0');
    var el = document.getElementById('date-display');
    el.textContent = dd + ' / ' + mm + ' / ' + calYear;
    el.style.color = '#1e1e1e';
    document.getElementById('s1-date').value = calYear + '-' + mm + '-' + dd;
    closePickers();
  };

  function renderTime(type) {
    var popup = document.getElementById(type + '-popup');
    var tv = timeVals[type];
    var h = '<div style="display:flex;gap:8px;">';
    // Hours
    h += '<div style="flex:1;"><div style="text-align:center;font-size:11px;font-weight:700;color:#646262;margin-bottom:6px;text-transform:uppercase;">h</div>';
    h += '<div id="' + type + '-hcol" style="max-height:180px;overflow-y:auto;border-radius:4px;">';
    for (var hh = 0; hh < 24; hh++) {
      var hs = String(hh).padStart(2,'0');
      var sel = (hh === tv.h);
      h += '<div onclick="window.timeSel(\'' + type + '\',\'h\',' + hh + ')" style="padding:5px;text-align:center;border-radius:4px;cursor:pointer;font-size:14px;font-weight:500;background:' + (sel ? '#72c073' : 'transparent') + ';color:' + (sel ? 'white' : '#1e1e1e') + ';">' + hs + '</div>';
    }
    h += '</div></div>';
    // Separator
    h += '<div style="display:flex;align-items:center;padding-top:22px;font-size:20px;font-weight:700;color:#1e1e1e;">:</div>';
    // Minutes
    h += '<div style="flex:1;"><div style="text-align:center;font-size:11px;font-weight:700;color:#646262;margin-bottom:6px;text-transform:uppercase;">min</div>';
    h += '<div id="' + type + '-mcol" style="max-height:180px;overflow-y:auto;border-radius:4px;">';
    for (var mm = 0; mm < 60; mm += 5) {
      var ms = String(mm).padStart(2,'0');
      var selm = (mm === tv.m);
      h += '<div onclick="window.timeSel(\'' + type + '\',\'m\',' + mm + ')" style="padding:5px;text-align:center;border-radius:4px;cursor:pointer;font-size:14px;font-weight:500;background:' + (selm ? '#72c073' : 'transparent') + ';color:' + (selm ? 'white' : '#1e1e1e') + ';">' + ms + '</div>';
    }
    h += '</div></div></div>';
    popup.innerHTML = h;
    // Scroll to selected
    var hcol = document.getElementById(type + '-hcol');
    var mcol = document.getElementById(type + '-mcol');
    if (hcol) { var hs2 = hcol.querySelector('[style*="#72c073"]'); if (hs2) hs2.scrollIntoView({block:'center'}); }
    if (mcol) { var ms2 = mcol.querySelector('[style*="#72c073"]'); if (ms2) ms2.scrollIntoView({block:'center'}); }
  }
  window.timeSel = function(type, part, val) {
    timeVals[type][part] = val;
    var tv = timeVals[type];
    renderTime(type);
    if (tv.h !== null && tv.m !== null) {
      var hs = String(tv.h).padStart(2,'0');
      var ms = String(tv.m).padStart(2,'0');
      var disp = document.getElementById(type + '-display');
      disp.textContent = hs + ':' + ms;
      disp.style.color = '#1e1e1e';
      document.getElementById('s1-' + type).value = hs + ':' + ms;
    }
  };

  refreshCircles();
})();
