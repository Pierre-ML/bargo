// @ts-nocheck
// Logique complète de la page session/[id]
// Toutes les actions passent par /api/sessions/{id}/... (cookie de session
// httpOnly, droits vérifiés côté serveur). Aucun token côté client.

(function () {
  var d        = JSON.parse(document.getElementById('page-data').textContent);
  var session  = d.session;

  var isEnCours   = d.isEnCours;
  var barActuel   = d.barActuel;
  var isSam       = d.isSam;
  var isHote      = d.isHote;
  var isHoteOrSam = isHote || isSam;
  var samIds      = d.samIds;
  var isMembre    = d.isMembre;
  var invitesIds  = (d.invitesIds || []).slice();

  var bars     = d.bars.slice();
  var jeux     = d.jeux.slice();
  var amis     = d.amis.map(function (u) { return Object.assign({}, u, { sam: samIds.indexOf(u.id) >= 0 }); });

  var allBars   = d.allBars;
  var allJeux   = d.allJeux;
  var allAmies  = d.allAmies || [];
  // pendingInvites: amis qu'on vient d'inviter (pas encore membres), avec leur statut SAM
  var pendingInvites = [];

  var activeTab     = 'bars';
  var modalMode     = null;
  var paramsEditing = false;

  // ── Helpers ──────────────────────────────────────────────────────
  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function imgUrl(rec, file) {
    return file ? '/fichiers/' + file : null;
  }
  function thumb(url, alt) {
    if (!url) return '<div style="width:100%;height:100%;background:#3a3a3a;border-radius:3px;"></div>';
    return '<img src="' + url + '" alt="' + esc(alt) + '" style="width:100%;height:100%;object-fit:cover;" />';
  }
  function avatarHtml(user, size) {
    size = size || 44;
    var url = imgUrl(user, user.avatar);
    if (url) return '<img src="' + url + '" alt="' + esc(user.pseudo) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />';
    var l = (user.pseudo || user.prenom || '?').charAt(0).toUpperCase();
    return '<div style="width:100%;height:100%;background:#347645;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:' + Math.round(size * 0.38) + 'px;">' + esc(l) + '</div>';
  }
  function card(url, title, sub) {
    return '<div style="display:flex;align-items:center;gap:14px;background:#2c2c2c;border-radius:5px;padding:12px;margin-bottom:10px;">' +
      '<div style="width:50px;height:50px;flex-shrink:0;border-radius:3px;overflow:hidden;">' + thumb(url, title) + '</div>' +
      '<div style="flex:1;min-width:0;"><p style="color:white;font-size:14px;font-weight:500;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(title) + '</p>' +
        (sub ? '<p style="color:rgba(247,241,237,0.5);font-size:12px;margin:2px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(sub) + '</p>' : '') +
      '</div></div>';
  }
  function empty(msg) {
    return '<p style="color:rgba(247,241,237,0.5);font-size:14px;font-weight:500;margin:0;">' + esc(msg) + '</p>';
  }
  function param(label, value) {
    return '<div><p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:rgba(247,241,237,0.5);margin:0 0 4px;">' + esc(label) + '</p><p style="color:white;font-size:15px;font-weight:500;margin:0;">' + esc(value) + '</p></div>';
  }
  function editParam(label, id, type, value) {
    return '<div><p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:rgba(247,241,237,0.5);margin:0 0 4px;">' + esc(label) + '</p>' +
      '<input id="' + id + '" type="' + type + '" value="' + esc(value) + '" style="width:100%;background:#2c2c2c;border:1px solid rgba(255,255,255,0.15);border-radius:3px;padding:7px 12px;color:white;font-size:14px;font-weight:500;outline:none;box-sizing:border-box;" /></div>';
  }
  function editParamArea(label, id, value) {
    return '<div><p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:rgba(247,241,237,0.5);margin:0 0 4px;">' + esc(label) + '</p>' +
      '<textarea id="' + id + '" rows="3" style="width:100%;background:#2c2c2c;border:1px solid rgba(255,255,255,0.15);border-radius:3px;padding:7px 12px;color:white;font-size:14px;font-weight:500;outline:none;resize:none;box-sizing:border-box;">' + esc(value) + '</textarea></div>';
  }
  function bigBarCard(bar, isCurrent) {
    var url    = imgUrl(bar, bar.image);
    var border = isCurrent ? 'border:2px solid #72c073;' : 'border:2px solid rgba(255,255,255,0.08);';
    return '<div style="background:#2c2c2c;border-radius:5px;overflow:hidden;' + border + '">' +
      '<div style="width:100%;height:120px;overflow:hidden;">' +
      (url ? '<img src="' + url + '" alt="' + esc(bar.nom) + '" style="width:100%;height:100%;object-fit:cover;" />'
           : '<div style="width:100%;height:100%;background:#3a3a3a;"></div>') +
      '</div>' +
      '<div style="padding:12px 14px;">' +
        '<p style="color:white;font-size:15px;font-weight:600;margin:0 0 3px;">' + esc(bar.nom) + '</p>' +
        (bar.adresse ? '<p style="color:rgba(247,241,237,0.5);font-size:12px;font-weight:500;margin:0;">' + esc(bar.adresse) + '</p>' : '') +
      '</div>' +
    '</div>';
  }
  function amiCard(ami, isSamRole) {
    var size  = 44;
    var avUrl = imgUrl(ami, ami.avatar);
    var avHtml = avUrl
      ? '<img src="' + avUrl + '" alt="' + esc(ami.pseudo) + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />'
      : '<div style="width:100%;height:100%;background:#347645;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:' + Math.round(size * 0.38) + 'px;">' + esc((ami.pseudo || ami.prenom || '?').charAt(0).toUpperCase()) + '</div>';
    var samBtn = isHote
      ? (isSamRole
          ? '<button data-sam-toggle="' + esc(ami.id) + '" style="flex-shrink:0;height:28px;padding:0 12px;font-size:11px;font-weight:700;border:none;border-radius:20px;cursor:pointer;background:#fef2f2;color:#ef4444;">Retirer SAM</button>'
          : '<button data-sam-toggle="' + esc(ami.id) + '" style="flex-shrink:0;height:28px;padding:0 12px;font-size:11px;font-weight:700;border:none;border-radius:20px;cursor:pointer;background:rgba(114,192,115,0.15);color:#72c073;">SAM +</button>')
      : '';
    return '<div style="display:flex;align-items:center;gap:12px;background:#2c2c2c;border-radius:5px;padding:12px;margin-bottom:10px;">' +
      '<div style="width:44px;height:44px;flex-shrink:0;border-radius:50%;overflow:hidden;">' + avHtml + '</div>' +
      '<div style="flex:1;min-width:0;"><p style="color:white;font-size:14px;font-weight:500;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(ami.pseudo || (ami.prenom + ' ' + ami.nom).trim() || 'Utilisateur') + '</p>' +
        (isSamRole ? '<span style="display:inline-block;background:#f7f1ed;color:#094736;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;margin-top:4px;">SAM</span>' : '') +
      '</div>' +
      samBtn +
    '</div>';
  }
  function bonusRow(label, value) {
    return '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
      '<p style="color:rgba(247,241,237,0.7);font-size:14px;font-weight:500;margin:0;">' + esc(label) + '</p>' +
      '<p style="color:white;font-size:14px;font-weight:600;margin:0;">' + esc(value) + '</p>' +
    '</div>';
  }

  // ── Tab switching ─────────────────────────────────────────────────
  function switchTab(tab) {
    activeTab     = tab;
    paramsEditing = false;
    document.querySelectorAll('.final-tab').forEach(function (btn) {
      var active = btn.dataset.tab === tab;
      btn.style.color             = active ? '#72c073' : 'rgba(247,241,237,0.5)';
      btn.style.borderBottomColor = active ? '#72c073' : 'transparent';
    });
    var bottomBar = document.getElementById('bottom-bar');
    if (bottomBar) bottomBar.style.display = (isEnCours || !isHote) ? 'none' : 'block';
    if (!isEnCours && isHote) {
      var addBtn = document.getElementById('btn-add-more');
      if (addBtn) {
        if (tab === 'params') {
          addBtn.textContent   = 'Modifier';
          addBtn.style.opacity = '1';
          addBtn.style.cursor  = 'pointer';
          addBtn.title         = '';
        } else {
          addBtn.textContent   = '+ Ajouter';
          addBtn.style.opacity = '1';
          addBtn.style.cursor  = 'pointer';
          addBtn.title         = '';
        }
      }
    }
    renderTab();
  }

  function renderTab() {
    isEnCours ? renderTabEnCours() : renderTabEnAttente();
  }

  // ── Rendu onglets (en attente) ────────────────────────────────────
  function renderTabEnAttente() {
    var el = document.getElementById('tab-content');
    if (activeTab === 'bars') {
      if (!bars.length) { el.innerHTML = empty('Aucun bar sélectionné.'); return; }
      el.innerHTML = bars.map(function (bar) { return card(imgUrl(bar, bar.image), bar.nom, bar.adresse); }).join('');
    } else if (activeTab === 'jeux') {
      if (!jeux.length) { el.innerHTML = empty('Aucun jeu sélectionné.'); return; }
      el.innerHTML = jeux.map(function (jeu) { return card(imgUrl(jeu, jeu.image), jeu.nom, jeu.description); }).join('');
    } else if (activeTab === 'amis') {
      if (!amis.length) { el.innerHTML = empty('Aucun ami invité.'); return; }
      el.innerHTML = amis.map(function (ami) { return amiCard(ami, ami.sam); }).join('');
    } else {
      if (!paramsEditing) {
        el.innerHTML = '<div style="display:flex;flex-direction:column;gap:16px;">' +
          param('Nom',             session.nom || '—') +
          param('Date',            session.date || '—') +
          param('Heure de départ', session.heure_debut || '—') +
          param('Heure de fin',    session.heure_fin || '—') +
          param('Lancement auto',  session.automatique ? '✓ Activé' : 'Désactivé') +
          (session.description ? param('Description', session.description) : '') +
          (isMembre && !isHote ? '<div style="margin-top:20px;"><button id="btn-quit-session" style="width:100%;height:42px;background:transparent;border:1px solid rgba(255,255,255,0.25);color:white;font-size:13px;font-weight:500;border-radius:5px;cursor:pointer;">Quitter la session</button></div>' : '') +
          (isHote ? '<div style="margin-top:8px;"><button id="btn-delete-session" style="background:#ef4444;border:none;color:white;font-size:13px;font-weight:500;height:36px;padding:0 18px;border-radius:3px;cursor:pointer;">Supprimer la session</button></div>' : '') +
        '</div>';
        if (isHote) document.getElementById('btn-delete-session')?.addEventListener('click', deleteSession);
        document.getElementById('btn-quit-session')?.addEventListener('click', quitterSession);
      } else {
        el.innerHTML = '<div style="display:flex;flex-direction:column;gap:14px;">' +
          editParam('Nom',             'p-nom',       'text', session.nom || '') +
          editParam('Date',            'p-date',      'date', session.date || '') +
          editParam('Heure de départ', 'p-heure',     'time', session.heure_debut || '') +
          editParam('Heure de fin',    'p-heure-fin', 'time', session.heure_fin || '') +
          editParamArea('Description', 'p-desc', session.description || '') +
          '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:10px 0;">' +
          '<input type="checkbox" id="p-automatique"' + (session.automatique ? ' checked' : '') + ' style="width:16px;height:16px;accent-color:#72c073;cursor:pointer;" />' +
          '<span style="font-size:13px;font-weight:500;color:rgba(247,241,237,0.85);">Lancement automatique</span>' +
          '</label>' +
        '</div>';
      }
    }
  }

  // ── Rendu onglets (en cours) ──────────────────────────────────────
  function renderTabEnCours() {
    var el = document.getElementById('tab-content');
    if (activeTab === 'bars') {
      if (!bars.length) { el.innerHTML = empty('Aucun bar dans cette session.'); return; }
      var cur  = Math.min(barActuel, bars.length - 1);
      var next = cur + 1 < bars.length ? bars[cur + 1] : null;
      var html = '<div style="margin-bottom:20px;">';
      html += '<p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#72c073;margin:0 0 10px;">Bar actuel</p>';
      html += bigBarCard(bars[cur], true) + '</div>';
      if (next) {
        html += '<div style="margin-bottom:20px;">';
        html += '<p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:rgba(247,241,237,0.4);margin:0 0 10px;">Prochain bar</p>';
        html += bigBarCard(next, false) + '</div>';
      }
      if (cur < bars.length - 1 && isHoteOrSam) {
        html += '<button id="btn-next-bar" style="width:100%;height:42px;background:#347645;border:none;color:white;font-size:14px;font-weight:500;cursor:pointer;border-radius:3px;margin-top:4px;">Passer au prochain bar →</button>';
      } else if (cur >= bars.length - 1) {
        html += '<p style="color:rgba(247,241,237,0.4);font-size:13px;font-weight:500;margin:8px 0 0;text-align:center;">Dernier bar de la session</p>';
      }
      el.innerHTML = html;
      document.getElementById('btn-next-bar')?.addEventListener('click', passerProchainBar);

    } else if (activeTab === 'jeux') {
      if (!jeux.length) { el.innerHTML = empty('Aucun jeu sélectionné.'); return; }
      el.innerHTML = jeux.map(function (jeu) {
        var url  = imgUrl(jeu, jeu.image);
        var href = jeu.type_du_jeux === 'questionaire' ? '/jeux_questionaire?session=' + session.id : '/jeux';
        return '<div style="display:flex;align-items:center;gap:14px;background:#2c2c2c;border-radius:5px;padding:12px;margin-bottom:10px;">' +
          '<div style="width:50px;height:50px;flex-shrink:0;border-radius:3px;overflow:hidden;">' + thumb(url, jeu.nom) + '</div>' +
          '<div style="flex:1;min-width:0;"><p style="color:white;font-size:14px;font-weight:500;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(jeu.nom) + '</p></div>' +
          '<a href="' + href + '" style="flex-shrink:0;height:32px;padding:0 16px;font-size:13px;font-weight:500;text-decoration:none;display:flex;align-items:center;border-radius:3px;background:#347645;color:white;">Jouer</a>' +
        '</div>';
      }).join('');

    } else if (activeTab === 'amis') {
      if (!amis.length) { el.innerHTML = empty('Aucun ami invité.'); return; }
      var samList   = amis.filter(function (a) { return samIds.indexOf(a.id) >= 0; });
      var otherList = amis.filter(function (a) { return samIds.indexOf(a.id) < 0; });
      var html = '';
      if (samList.length) {
        html += '<p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#72c073;margin:0 0 8px;">SAM</p>';
        html += samList.map(function (a) { return amiCard(a, true); }).join('');
        if (otherList.length) html += '<div style="height:1px;background:rgba(255,255,255,0.1);margin:12px 0;"></div>';
      }
      html += otherList.map(function (a) { return amiCard(a, false); }).join('');
      el.innerHTML = html;

    } else {
      el.innerHTML = '<div style="display:flex;flex-direction:column;gap:16px;">' +
        param('Nom',             session.nom || '—') +
        param('Date',            session.date || '—') +
        param('Heure de départ', session.heure_debut || '—') +
        param('Heure de fin',    session.heure_fin || '—') +
        param('Lancement auto',  session.automatique ? '✓ Activé' : 'Désactivé') +
        (session.description ? param('Description', session.description) : '') +
        (isMembre && !isHote ? '<div style="margin-top:20px;"><button id="btn-quit-session" style="width:100%;height:42px;background:transparent;border:1px solid rgba(255,255,255,0.25);color:white;font-size:13px;font-weight:500;border-radius:5px;cursor:pointer;">Quitter la session</button></div>' : '') +
        (isHote ? '<div style="margin-top:20px;"><button id="btn-stop-session" style="width:100%;height:46px;background:#ef4444;border:none;color:white;font-size:14px;font-weight:700;border-radius:5px;cursor:pointer;letter-spacing:0.3px;">⏹ Arrêter la session</button></div>' : '') +
      '</div>';
      document.getElementById('btn-quit-session')?.addEventListener('click', quitterSession);
      document.getElementById('btn-stop-session')?.addEventListener('click', function () {
        document.getElementById('stop-modal').style.display = 'flex';
      });
    }
  }

  // ── Session API calls ─────────────────────────────────────────────
  // Tout passe par /api/sessions/{id}/... : l'utilisateur est identifié par
  // son cookie de session (httpOnly), le serveur vérifie les droits.
  var API = '/api/sessions/' + encodeURIComponent(session.id);
  async function appel(method, url, body) {
    try {
      var res  = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      var data = await res.json().catch(function () { return {}; });
      return { ok: res.ok, status: res.status, data: data };
    } catch (_) {
      return { ok: false, status: 0, data: {} };
    }
  }

  function deleteSession() {
    document.getElementById('delete-modal').style.display = 'flex';
  }

  async function confirmDeleteSession() {
    var btn = document.getElementById('delete-modal-confirm');
    btn.disabled = true; btn.textContent = 'Suppression…';
    await appel('DELETE', API);
    window.location.href = '/session';
  }

  async function quitterSession() {
    if (!window.confirm('Quitter cette session ?')) return;
    var r = await appel('POST', API + '/quitter');
    if (r.ok) window.location.href = '/session';
  }

  async function patchSessionParams(nom, date, heure_debut, heure_fin, description, automatique) {
    var dtDepart = (date && heure_debut) ? date + ' ' + heure_debut + ':00' : null;
    var dtArriver = null;
    if (date && heure_fin) {
      var toMin = function(t) { var p = (t || '').split(':'); return parseInt(p[0] || 0) * 60 + parseInt(p[1] || 0); };
      var finDay = (heure_debut && toMin(heure_fin) < toMin(heure_debut)) ? 1 : 0;
      if (finDay) {
        var d = new Date(date + 'T00:00:00');
        d.setDate(d.getDate() + 1);
        var dd = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        dtArriver = dd + ' ' + heure_fin + ':00';
      } else {
        dtArriver = date + ' ' + heure_fin + ':00';
      }
    }
    var r = await appel('PATCH', API, { nom: nom, date_depart: dtDepart, date_arrivee: dtArriver, description: description, automatique: !!automatique });
    // Refusé par le serveur : on recharge pour réafficher les vraies valeurs
    if (!r.ok) window.location.reload();
  }

  async function lancerSession() {
    var btn = document.getElementById('btn-launch-session');
    function avertir(msg) {
      if (!btn) return;
      btn.disabled = false;
      btn.textContent = msg;
      btn.style.background = '#ef4444';
      setTimeout(function () {
        btn.textContent = '▶ Lancer la session';
        btn.style.background = '#347645';
      }, 3000);
    }
    if (samIds.length === 0) { avertir('⚠ Ajoutez au moins un SAM'); return; }
    if (btn) { btn.disabled = true; btn.textContent = 'Lancement…'; }
    var r = await appel('POST', API + '/demarrer');
    if (!r.ok) { avertir('⚠ ' + (r.data.error || 'Lancement impossible')); return; }
    isEnCours = true;
    var bottomBar = document.getElementById('bottom-bar');
    if (bottomBar) bottomBar.style.display = 'none';
    renderTab();
  }

  async function passerProchainBar() {
    var r = await appel('POST', API + '/bar-suivant');
    if (r.ok && typeof r.data.bar_actuel === 'number') barActuel = r.data.bar_actuel;
    renderTab();
    refreshMapMarkers();
  }

  async function confirmStopSession() {
    var btn = document.getElementById('stop-modal-confirm');
    btn.disabled = true; btn.textContent = 'Arrêt…';
    // Les points sont calculés et attribués par le serveur (montants fixes)
    var r = await appel('POST', API + '/terminer');
    if (!r.ok) {
      btn.disabled = false; btn.textContent = 'Oui, arrêter';
      showStopError(r.data.error || 'Impossible d\'arrêter la session.');
      return;
    }
    var memberPoints = (r.data.classement || []).map(function (u) { return { ami: u, points: u.points || 0 }; });
    document.getElementById('stop-modal').style.display = 'none';
    var abonnLabel = r.data.abonnement && r.data.abonnement !== 'Gratuit' ? r.data.abonnement : null;
    showEndScreen(r.data.bars_visites || 0, r.data.base || 0, r.data.total || 0, memberPoints, abonnLabel, r.data.multiplicateur || 1);
  }
  function showStopError(msg) {
    var btn = document.getElementById('stop-modal-confirm');
    btn.textContent = msg;
    setTimeout(function () { btn.textContent = 'Oui, arrêter'; }, 3000);
  }

  function showEndScreen(barsVisites, baseBonus, totalBonus, memberPoints, abonnLabel, multiplier) {
    var bonusHtml =
      '<div style="background:#252525;border-radius:5px;padding:20px 24px;margin-bottom:28px;">' +
        '<p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#72c073;margin:0 0 16px;">Vos bonus de fin de session</p>' +
        bonusRow('Bars visités (' + barsVisites + ')', '+' + baseBonus + ' pts') +
        (abonnLabel ? bonusRow('Multiplicateur ' + abonnLabel + ' (×' + multiplier + ')', '×' + multiplier) : '') +
        '<div style="height:1px;background:rgba(255,255,255,0.1);margin:14px 0;"></div>' +
        '<div style="display:flex;justify-content:space-between;align-items:center;">' +
          '<p style="color:white;font-size:15px;font-weight:600;margin:0;">Total bonus</p>' +
          '<p style="color:#72c073;font-size:22px;font-weight:700;margin:0;">+' + totalBonus + ' pts</p>' +
        '</div>' +
      '</div>';
    var membersHtml = '';
    if (memberPoints.length) {
      membersHtml += '<p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:rgba(247,241,237,0.4);margin:0 0 12px;">Classement des membres</p>';
      membersHtml += memberPoints.map(function(mp, i) {
        return '<div style="display:flex;align-items:center;gap:12px;background:#2c2c2c;border-radius:5px;padding:12px;margin-bottom:8px;">' +
          '<span style="color:rgba(247,241,237,0.35);font-size:12px;font-weight:700;width:20px;text-align:center;flex-shrink:0;">' + (i + 1) + '</span>' +
          '<div style="width:36px;height:36px;flex-shrink:0;border-radius:50%;overflow:hidden;">' + avatarHtml(mp.ami, 36) + '</div>' +
          '<p style="color:white;font-size:14px;font-weight:500;margin:0;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(mp.ami.pseudo || ((mp.ami.prenom || '') + ' ' + (mp.ami.nom || '')).trim() || 'Utilisateur') + '</p>' +
          '<p style="color:#72c073;font-size:15px;font-weight:700;margin:0;flex-shrink:0;">' + esc(mp.points) + ' pts</p>' +
        '</div>';
      }).join('');
    }
    document.getElementById('end-bonus-card').innerHTML   = bonusHtml;
    document.getElementById('end-members-list').innerHTML = membersHtml;
    document.getElementById('end-screen').style.display   = 'block';
  }

  // ── Modal ─────────────────────────────────────────────────────────
  function openModal(mode) {
    modalMode = mode;
    if (mode === 'amis') pendingInvites = invitesIds.map(function (id) { return { id: id, sam: samIds.indexOf(id) >= 0 }; });
    var titles = { bars: 'Ajouter des bars', jeux: 'Ajouter des jeux', amis: 'Ajouter des amis' };
    document.getElementById('modal-title').textContent = titles[mode] || 'Ajouter';
    document.getElementById('modal-search').value      = '';
    document.getElementById('add-modal').style.display = 'flex';
    renderModal('');
  }
  function closeModal() {
    document.getElementById('add-modal').style.display = 'none';
    renderTab();
  }
  function renderModal(q) {
    q = (q || '').toLowerCase();
    var list = document.getElementById('modal-list');

    if (modalMode === 'amis') {
      var iconPlus  = '<svg width="18" height="18" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="10" stroke="white" stroke-width="1.5"/><path d="M11 7v8M7 11h8" stroke="white" stroke-width="1.5" stroke-linecap="round"/></svg>';
      var iconCheck = '<svg width="18" height="18" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="11" fill="#72c073"/><path d="M6 11l4 4 6-6" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      var filtered = allAmies.filter(function (u) {
        return !q || (u.pseudo + ' ' + u.prenom + ' ' + u.nom).toLowerCase().includes(q);
      });
      if (!filtered.length) { list.innerHTML = empty('Aucun ami trouvé.'); return; }
      list.innerHTML = filtered.map(function (user) {
        var isMembre  = amis.some(function (a) { return a.id === user.id; });
        var isPending = pendingInvites.some(function (p) { return p.id === user.id; });
        var isSamPend = pendingInvites.some(function (p) { return p.id === user.id && p.sam; });
        var name = esc(user.pseudo || (user.prenom + ' ' + user.nom).trim() || 'Utilisateur');
        var addBg = isMembre ? '#ef4444' : (isPending ? '#646262' : '#347645');
        var addLabel = isMembre ? '✕ Retirer' : (isPending ? iconCheck + ' Invité' : '<span>+</span> Inviter');
        var samBorder = isSamPend ? '#72c073' : 'rgba(255,255,255,0.2)';
        return '<div style="display:flex;align-items:center;gap:12px;background:#2c2c2c;border-radius:5px;padding:12px;margin-bottom:8px;">' +
          '<div style="width:44px;height:44px;flex-shrink:0;border-radius:50%;overflow:hidden;">' + avatarHtml(user, 44) + '</div>' +
          '<div style="flex:1;min-width:0;"><p style="color:white;font-size:14px;font-weight:500;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + name + '</p></div>' +
          '<div style="display:flex;gap:6px;flex-shrink:0;">' +
            '<button data-action="modal-toggle-ami" data-id="' + user.id + '" style="height:32px;padding:0 12px;font-size:12px;font-weight:500;border:none;cursor:pointer;border-radius:3px;background:' + addBg + ';color:white;display:flex;align-items:center;gap:4px;">' + addLabel + '</button>' +
            (!isMembre ? '<button data-action="modal-toggle-sam" data-id="' + user.id + '" style="height:32px;padding:0 10px;font-size:12px;font-weight:600;cursor:pointer;border-radius:3px;background:transparent;color:white;border:2px solid ' + samBorder + ';">SAM</button>' : '') +
          '</div>' +
        '</div>';
      }).join('');
      list.querySelectorAll('[data-action="modal-toggle-ami"]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = btn.dataset.id;
          if (amis.some(function (a) { return a.id === id; })) {
            amis = amis.filter(function (a) { return a.id !== id; });
            removeMember(id);
          } else if (!pendingInvites.some(function (p) { return p.id === id; })) {
            var isSamVal = pendingInvites.some(function (p) { return p.id === id && p.sam; });
            pendingInvites.push({ id: id, sam: isSamVal });
            inviteUser(id, isSamVal);
          }
          renderModal(document.getElementById('modal-search').value);
        });
      });
      list.querySelectorAll('[data-action="modal-toggle-sam"]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = btn.dataset.id;
          var p  = pendingInvites.find(function (p) { return p.id === id; });
          if (p) {
            p.sam = !p.sam;
            setSam(id, p.sam);
          } else {
            pendingInvites.push({ id: id, sam: true });
            inviteUser(id, true);
          }
          renderModal(document.getElementById('modal-search').value);
        });
      });
      return;
    }

    var src  = modalMode === 'bars' ? allBars : allJeux;
    var selFn = function (id) {
      if (modalMode === 'bars') return bars.some(function (b) { return b.id === id; });
      return jeux.some(function (j) { return j.id === id; });
    };
    var filtered = src.filter(function (item) {
      var txt = (item.nom || '') + ' ' + (item.adresse || item.description || '');
      return !q || txt.toLowerCase().includes(q);
    });
    list.innerHTML = filtered.map(function (item) {
      var s    = selFn(item.id);
      var name = esc(item.nom || 'Item');
      var sub  = esc(item.adresse || item.description || '');
      var thumbEl = '<div style="width:50px;height:50px;flex-shrink:0;border-radius:3px;overflow:hidden;">' + thumb(imgUrl(item, item.image), name) + '</div>';
      return '<div style="display:flex;align-items:center;gap:14px;background:#2c2c2c;border-radius:5px;padding:12px;margin-bottom:8px;">' +
        thumbEl +
        '<div style="flex:1;min-width:0;"><p style="color:white;font-size:14px;font-weight:500;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + name + '</p>' +
          (sub ? '<p style="color:rgba(247,241,237,0.5);font-size:12px;margin:2px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + sub + '</p>' : '') +
        '</div>' +
        '<button data-action="modal-toggle" data-id="' + item.id + '" style="flex-shrink:0;height:32px;padding:0 14px;font-size:13px;font-weight:500;border:none;cursor:pointer;border-radius:3px;background:' + (s ? '#72c073' : '#347645') + ';color:' + (s ? '#094736' : 'white') + ';">' + (s ? '✓' : '+') + '</button>' +
      '</div>';
    }).join('') || empty('Aucun résultat.');
    list.querySelectorAll('[data-action="modal-toggle"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        modalToggle(btn.dataset.id);
        renderModal(document.getElementById('modal-search').value);
      });
    });
  }
  function modalToggle(id) {
    if (modalMode === 'bars') {
      var idx = bars.findIndex(function (b) { return b.id === id; });
      if (idx >= 0) bars.splice(idx, 1);
      else { var b = allBars.find(function (b) { return b.id === id; }); if (b) bars.push(b); }
      patchBars();
      refreshMapMarkers();
    } else if (modalMode === 'jeux') {
      // un seul jeu par session
      var idx = jeux.findIndex(function (j) { return j.id === id; });
      if (idx >= 0) jeux.splice(idx, 1);
      else { var j = allJeux.find(function (j) { return j.id === id; }); if (j) jeux.push(j); }
      patchJeu();
    }
  }
  async function inviteUser(targetUserId, asSam) {
    var r = await appel('POST', API + '/invitations', { user_id: targetUserId, sam: !!asSam });
    if (!r.ok) {
      pendingInvites = pendingInvites.filter(function (p) { return p.id !== targetUserId; });
      renderModal(document.getElementById('modal-search').value);
      return;
    }
    if (invitesIds.indexOf(targetUserId) < 0) invitesIds.push(targetUserId);
    if (asSam && samIds.indexOf(targetUserId) < 0) samIds.push(targetUserId);
  }
  async function removeMember(userId) {
    var r = await appel('DELETE', API + '/participants/' + encodeURIComponent(userId));
    if (!r.ok) { window.location.reload(); return; }
    samIds = samIds.filter(function (id) { return id !== userId; });
  }
  async function setSam(userId, value) {
    var r = await appel('POST', API + '/sam', { user_id: userId, sam: value });
    if (!r.ok) return false;
    if (value && samIds.indexOf(userId) < 0) samIds.push(userId);
    if (!value) samIds = samIds.filter(function (id) { return id !== userId; });
    return true;
  }
  async function patchBars() {
    var r = await appel('PUT', API + '/bars', { bars: bars.map(function (b) { return b.id; }) });
    if (!r.ok) window.location.reload();
  }
  async function patchJeu() {
    var r = await appel('PUT', API + '/jeu', { jeu_id: jeux.length > 0 ? jeux[0].id : null });
    if (!r.ok) window.location.reload();
  }

  async function toggleSam(amiId) {
    var isSamNow = samIds.indexOf(amiId) >= 0;
    if (!(await setSam(amiId, !isSamNow))) return;
    amis = amis.map(function (a) { return Object.assign({}, a, { sam: samIds.indexOf(a.id) >= 0 }); });
    renderTab();
  }

  // ── Carte Leaflet ─────────────────────────────────────────────────
  var leafletMarkers = [];
  function initMap() {
    var mapEl = document.getElementById('session-map');
    mapEl.innerHTML = '';
    function setup() {
      var center = [47.5072, 6.7955];
      window._sessionMap = L.map('session-map').setView(center, 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }).addTo(window._sessionMap);
      addMarkers();
    }
    if (window.L) { setup(); return; }
    var link  = document.createElement('link');
    link.rel  = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    var s    = document.createElement('script');
    s.src    = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.onload = setup;
    document.head.appendChild(s);
  }
  function addMarkers() {
    var map = window._sessionMap;
    if (!map) return;
    leafletMarkers.forEach(function (m) { m.remove(); });
    leafletMarkers = [];
    var barsToShow = isEnCours ? bars.slice(Math.min(barActuel, bars.length - 1), Math.min(barActuel, bars.length - 1) + 2) : bars;
    var withCoords = barsToShow.filter(function (b) { return b.lat && b.lon; });
    withCoords.forEach(function (bar, idx) {
      var isCurrent = isEnCours && idx === 0;
      var m = L.marker([bar.lat, bar.lon]).addTo(map)
        .bindPopup('<strong style="color:' + (isCurrent ? '#72c073' : '#347645') + '">' + esc(bar.nom) + '</strong><br>' + esc(bar.adresse));
      leafletMarkers.push(m);
    });
    if (withCoords.length > 0) map.fitBounds(L.featureGroup(leafletMarkers).getBounds().pad(0.3));
  }
  function refreshMapMarkers() {
    if (window._sessionMap) addMarkers();
  }

  // ── Événements ───────────────────────────────────────────────────
  document.querySelectorAll('.final-tab').forEach(function (btn) {
    btn.addEventListener('click', function () { switchTab(btn.dataset.tab); });
  });

  document.getElementById('tab-content').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-sam-toggle]');
    if (btn && isHote) toggleSam(btn.dataset.samToggle);
  });

  document.getElementById('btn-add-more')?.addEventListener('click', function () {
    if (activeTab === 'params') {
      if (!isHote) return;
      if (!paramsEditing) {
        paramsEditing    = true;
        this.textContent = 'Confirmer';
        renderTab();
      } else {
        var nom        = document.getElementById('p-nom')?.value            ?? session.nom;
        var date       = document.getElementById('p-date')?.value           ?? session.date;
        var heure      = document.getElementById('p-heure')?.value          ?? session.heure_debut;
        var heureFin   = document.getElementById('p-heure-fin')?.value      ?? session.heure_fin;
        var desc       = document.getElementById('p-desc')?.value           ?? session.description;
        var auto       = !!(document.getElementById('p-automatique')?.checked);
        session.nom = nom; session.date = date; session.heure_debut = heure; session.heure_fin = heureFin; session.description = desc; session.automatique = auto;
        patchSessionParams(nom, date, heure, heureFin, desc, auto);
        paramsEditing    = false;
        this.textContent = 'Modifier';
        renderTab();
      }
      return;
    }
    if (!isHote) return;
    openModal(activeTab);
  });

  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-confirm').addEventListener('click', closeModal);
  document.getElementById('add-modal').addEventListener('click', function (e) { if (e.target === this) closeModal(); });
  document.getElementById('modal-search').addEventListener('input', function () { renderModal(this.value); });

  document.getElementById('delete-modal-confirm').addEventListener('click', confirmDeleteSession);
  document.getElementById('delete-modal-cancel').addEventListener('click', function () { document.getElementById('delete-modal').style.display = 'none'; });
  document.getElementById('delete-modal').addEventListener('click', function (e) { if (e.target === this) this.style.display = 'none'; });

  document.getElementById('btn-launch-session')?.addEventListener('click', lancerSession);

  document.getElementById('stop-modal-confirm')?.addEventListener('click', confirmStopSession);
  document.getElementById('stop-modal-cancel')?.addEventListener('click', function () { document.getElementById('stop-modal').style.display = 'none'; });
  document.getElementById('stop-modal')?.addEventListener('click', function (e) { if (e.target === this) this.style.display = 'none'; });

  // ── Lancement / fin automatiques (le serveur décide d'après les dates) ───
  setInterval(function () {
    if (!session.automatique) return;
    appel('POST', API + '/auto').then(function (r) {
      if (!r.ok) return;
      if (r.data.etat === 'fini') { window.location.href = '/session'; return; }
      if (r.data.etat === 'en_cours' && !isEnCours) {
        isEnCours = true;
        var bottomBar = document.getElementById('bottom-bar');
        if (bottomBar) bottomBar.style.display = 'none';
        renderTab();
      }
    });
  }, 30000);

  // ── Init ─────────────────────────────────────────────────────────
  renderTab();
  initMap();
})();
