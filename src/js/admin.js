// @ts-nocheck
// Logique de la page admin

(function () {
  var d            = JSON.parse(document.getElementById('page-data').textContent);
  var PB_URL       = d.PB_URL;
  var TOKEN        = d.token;
  var allBars      = d.allBars;
  var allBoisons   = d.allBoisons;
  var allJeux      = d.allJeux;
  var allBoutique  = d.allBoutique;
  var allQuestions = d.allQuestions; // cache local, mis à jour après ajout/suppression

  // ── Sidebar navigation ────────────────────────────────────────────────────
  function switchSection(sectionId) {
    document.querySelectorAll('.admin-section').forEach(function (s) { s.classList.add('hidden'); });
    var target = document.getElementById('section-' + sectionId);
    if (target) target.classList.remove('hidden');

    document.querySelectorAll('.nav-item').forEach(function (btn) {
      var active = btn.dataset.section === sectionId;
      btn.style.background = active ? 'rgba(114,192,115,0.15)' : 'transparent';
      btn.style.color      = active ? '#72c073' : 'rgba(247,241,237,0.55)';
      // badge
      var badge = btn.querySelector('span:last-child');
      if (badge && badge !== btn.querySelector('span:first-child')) {
        badge.style.background = active ? 'rgba(114,192,115,0.2)' : 'rgba(255,255,255,0.08)';
        badge.style.color      = active ? '#72c073' : 'rgba(247,241,237,0.4)';
      }
    });
  }

  document.querySelectorAll('.nav-item').forEach(function (btn) {
    btn.addEventListener('click', function () {
      switchSection(btn.dataset.section);
      // Mettre à jour le label mobile + fermer sidebar
      var mobLabel = document.getElementById('admin-mob-section');
      if (mobLabel) mobLabel.textContent = btn.querySelector('span:first-child').textContent;
      closeSidebar();
    });
  });

  // ── Mobile hamburger ───────────────────────────────────────────────────────
  var sidebar  = document.querySelector('.admin-sidebar');
  var burger   = document.getElementById('admin-burger');
  var backdrop = document.getElementById('admin-backdrop');

  function isMobile() { return window.innerWidth < 1024; }

  function openSidebar() {
    if (!sidebar) return;
    sidebar.classList.add('open');
    sidebar.style.transform = 'translateX(0)';
    if (burger)   burger.classList.add('is-open');
    if (backdrop) backdrop.style.display = 'block';
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    if (!sidebar) return;
    sidebar.classList.remove('open');
    if (isMobile()) sidebar.style.transform = 'translateX(-100%)';
    else            sidebar.style.transform = '';
    if (burger)   burger.classList.remove('is-open');
    if (backdrop) backdrop.style.display = 'none';
    document.body.style.overflow = '';
  }

  if (burger)   burger.addEventListener('click', function () {
    sidebar && sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
  });
  if (backdrop) backdrop.addEventListener('click', closeSidebar);

  // ── Confirm modal ─────────────────────────────────────────────────────────
  var pendingAction = null;

  function openConfirm(title, body, action) {
    pendingAction = action;
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-body').textContent  = body;
    document.getElementById('confirm-modal').style.display = 'flex';
  }

  document.getElementById('confirm-cancel').addEventListener('click', function () {
    document.getElementById('confirm-modal').style.display = 'none';
    pendingAction = null;
  });
  document.getElementById('confirm-modal').addEventListener('click', function (e) {
    if (e.target === this) { this.style.display = 'none'; pendingAction = null; }
  });
  document.getElementById('confirm-ok').addEventListener('click', async function () {
    var btn = this;
    btn.disabled = true; btn.textContent = '…';
    if (pendingAction) await pendingAction();
    document.getElementById('confirm-modal').style.display = 'none';
    pendingAction = null;
    btn.disabled = false; btn.textContent = 'Confirmer';
  });

  // ── Drawer ────────────────────────────────────────────────────────────────
  var drawer        = document.getElementById('drawer');
  var drawerOverlay = document.getElementById('drawer-overlay');
  var drawerMode    = null; // 'bar' | 'boison' | 'boutique'
  var editingId     = null;

  function openDrawer() {
    drawerOverlay.style.display = 'block';
    drawer.style.transform = 'translateX(0)';
  }
  function closeDrawer() {
    drawer.style.transform = 'translateX(100%)';
    drawerOverlay.style.display = 'none';
    drawerMode = null;
    editingId  = null;
  }

  document.getElementById('drawer-close').addEventListener('click', closeDrawer);
  drawerOverlay.addEventListener('click', closeDrawer);

  var S = {
    group:   'margin-bottom:18px;',
    label:   'font-size:12px; font-weight:700; color:#444; margin:0 0 6px; display:block; letter-spacing:0.3px;',
    input:   'width:100%; background:#f9fafb; border:1.5px solid #e5e7eb; border-radius:8px; padding:10px 14px; color:#111; font-size:14px; font-weight:500; outline:none; box-sizing:border-box;',
    section: 'font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#999; margin:24px 0 12px; padding-bottom:8px; border-bottom:1px solid #f0f0f0;',
  };

  // ── Form: bar ─────────────────────────────────────────────────────────────
  var JOURS = [
    { key: 'h_lundi',    label: 'Lundi'    },
    { key: 'h_mardi',    label: 'Mardi'    },
    { key: 'h_mercredi', label: 'Mercredi' },
    { key: 'h_jeudi',    label: 'Jeudi'    },
    { key: 'h_vendredi', label: 'Vendredi' },
    { key: 'h_samedi',   label: 'Samedi'   },
    { key: 'h_dimanche', label: 'Dimanche' },
  ];

  function openBarForm(id) {
    drawerMode = 'bar';
    editingId  = id || null;
    var bar    = id ? allBars.find(function (b) { return b.id === id; }) : null;

    document.getElementById('drawer-label').textContent = 'Bars';
    document.getElementById('drawer-title').textContent = bar ? 'Modifier le bar' : 'Nouveau bar';
    document.getElementById('drawer-error').style.display = 'none';

    var imgPreview = bar && bar.img
      ? '<img src="' + PB_URL + '/api/files/' + bar.collectionName + '/' + bar.id + '/' + bar.img
        + '" style="width:100%; height:140px; object-fit:cover; border-radius:8px; margin-bottom:8px; display:block;" />'
      : '';

    document.getElementById('drawer-body').innerHTML =
      '<p style="' + S.section + '">Informations générales</p>' +
      field('nom',         'Nom du bar *',  'text',   bar ? bar.nom : '',         '') +
      field('adresse',     'Adresse',       'text',   bar ? bar.adresse : '',     'ex : 12 Rue de la Paix') +
      area ('description', 'Description',             bar ? bar.description : '') +

      '<p style="' + S.section + '">Localisation (carte)</p>' +
      '<div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">' +
        field('lat', 'Latitude',  'number', bar ? bar.lat : '', 'ex : 47.5079') +
        field('lon', 'Longitude', 'number', bar ? bar.lon : '', 'ex : 6.7985') +
      '</div>' +

      '<p style="' + S.section + '">Image principale</p>' +
      '<div style="' + S.group + '">' +
        imgPreview +
        '<label style="' + S.label + '">' + (bar && bar.img ? 'Remplacer l\'image' : 'Choisir une image') + '</label>' +
        '<input id="f-img" type="file" accept="image/*" style="font-size:13px; color:#555;" />' +
      '</div>' +

      '<p style="' + S.section + '">Horaires d\'ouverture</p>' +
      '<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">' +
        JOURS.map(function (j) {
          return field(j.key, j.label, 'text', bar ? (bar[j.key] || '') : '', 'Fermé');
        }).join('') +
      '</div>';

    openDrawer();
  }

  // ── Form: boisson ─────────────────────────────────────────────────────────
  function openBoisonForm(id) {
    drawerMode = 'boison';
    editingId  = id || null;
    var boison = id ? allBoisons.find(function (b) { return b.id === id; }) : null;

    document.getElementById('drawer-label').textContent = 'Boissons';
    document.getElementById('drawer-title').textContent = boison ? 'Modifier la boisson' : 'Nouvelle boisson';
    document.getElementById('drawer-error').style.display = 'none';

    var imgPreview = boison && boison.img
      ? '<img src="' + PB_URL + '/api/files/' + boison.collectionName + '/' + boison.id + '/' + boison.img
        + '" style="width:100%; height:140px; object-fit:cover; border-radius:8px; margin-bottom:8px; display:block;" />'
      : '';

    document.getElementById('drawer-body').innerHTML =
      '<p style="' + S.section + '">Informations</p>' +
      field('nom', 'Nom de la boisson *', 'text', boison ? boison.nom : '', 'ex : Biere blonde, Coca') +

      '<p style="' + S.section + '">Image</p>' +
      '<div style="' + S.group + '">' +
        imgPreview +
        '<label style="' + S.label + '">' + (boison && boison.img ? 'Remplacer l\'image' : 'Choisir une image') + '</label>' +
        '<input id="f-img" type="file" accept="image/*" style="font-size:13px; color:#555;" />' +
      '</div>';

    openDrawer();
  }

  // ── Helpers HTML ──────────────────────────────────────────────────────────
  function field(id, label, type, value, placeholder) {
    return '<div style="' + S.group + '">' +
      '<label for="f-' + id + '" style="' + S.label + '">' + label + '</label>' +
      '<input id="f-' + id + '" type="' + type + '" value="' + escAttr(value) + '"' +
      (placeholder ? ' placeholder="' + escAttr(placeholder) + '"' : '') +
      ' style="' + S.input + '" /></div>';
  }
  function area(id, label, value) {
    return '<div style="' + S.group + '">' +
      '<label for="f-' + id + '" style="' + S.label + '">' + label + '</label>' +
      '<textarea id="f-' + id + '" rows="3" style="' + S.input + ' resize:vertical;">' + escText(value) + '</textarea></div>';
  }
  function escAttr(s) { return String(s ?? '').replace(/"/g, '&quot;'); }
  function escText(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
  function val(id) { var el = document.getElementById('f-' + id); return el ? el.value.trim() : ''; }
  function fileVal(id) { var el = document.getElementById('f-' + id); return el && el.files && el.files[0] ? el.files[0] : null; }

  // ── Submit ────────────────────────────────────────────────────────────────
  document.getElementById('drawer-submit').addEventListener('click', async function () {
    var btn = this;
    btn.disabled = true; btn.textContent = 'Enregistrement…';
    var errEl = document.getElementById('drawer-error');
    errEl.style.display = 'none';

    try {
      if (drawerMode === 'bar')      await submitBar();
      if (drawerMode === 'boison')   await submitBoison();
      if (drawerMode === 'boutique') await submitBoutique();
      if (drawerMode === 'jeu')      { await submitJeu(); closeDrawer(); return; }
      if (drawerMode === 'question') { await submitQuestion(); closeDrawer(); return; }
      closeDrawer();
      window.location.reload();
    } catch (err) {
      errEl.textContent = err.message || 'Une erreur est survenue.';
      errEl.style.display = 'block';
    } finally {
      btn.disabled = false; btn.textContent = 'Enregistrer';
    }
  });

  async function submitBar() {
    var nom = val('nom');
    if (!nom) throw new Error('Le nom est obligatoire.');

    var fd = new FormData();
    fd.append('nom',         nom);
    fd.append('adresse',     val('adresse'));
    fd.append('description', val('description'));

    var lat = val('lat'), lon = val('lon');
    if (lat !== '' && lon !== '') {
      fd.append('localisation', JSON.stringify({ lat: parseFloat(lat), lon: parseFloat(lon) }));
    }

    var horaires = { horaires_lundi: val('h_lundi'), horaires_mardi: val('h_mardi'),
      horaires_mercredi: val('h_mercredi'), horaires_jeudi: val('h_jeudi'),
      horaires_vendredi: val('h_vendredi'), horaires_samedi: val('h_samedi'),
      horaires_dimanche: val('h_dimanche') };
    for (var k in horaires) fd.append(k, horaires[k]);

    var imgFile = fileVal('img');
    if (imgFile) fd.append('img', imgFile);

    var res = await fetch(
      PB_URL + '/api/collections/bar/records' + (editingId ? '/' + editingId : ''),
      { method: editingId ? 'PATCH' : 'POST', headers: { Authorization: 'Bearer ' + TOKEN }, body: fd }
    );
    if (!res.ok) throw new Error((await res.json()).message || 'Erreur PocketBase.');
  }

  async function submitBoison() {
    var nom = val('nom');
    if (!nom) throw new Error('Le nom est obligatoire.');

    var fd = new FormData();
    fd.append('nom', nom);
    var imgFile = fileVal('img');
    if (imgFile) fd.append('img', imgFile);

    var res = await fetch(
      PB_URL + '/api/collections/boison/records' + (editingId ? '/' + editingId : ''),
      { method: editingId ? 'PATCH' : 'POST', headers: { Authorization: 'Bearer ' + TOKEN }, body: fd }
    );
    if (!res.ok) throw new Error((await res.json()).message || 'Erreur PocketBase.');
  }

  // ── Form: boutique ────────────────────────────────────────────────────────
  var TYPE_OPTIONS = [
    { value: 'decoration_avatar', label: 'Décoration avatar' },
    { value: 'theme',             label: 'Thème du profil'   },
    { value: 'titre',             label: 'Titre'             },
  ];

  function boutiqueTypeSelect(current) {
    return '<select id="f-type" style="' + S.input + '">' +
      TYPE_OPTIONS.map(function (t) {
        return '<option value="' + t.value + '"' + (current === t.value ? ' selected' : '') + '>' + t.label + '</option>';
      }).join('') +
    '</select>';
  }

  function boutiqueConditionalField(item) {
    var type = item ? item.type : 'decoration_avatar';
    if (type === 'titre') {
      return '<div id="f-conditional" style="' + S.group + '">' +
        '<label style="' + S.label + '">Texte du titre *</label>' +
        '<input id="f-type-titre" type="text" value="' + escAttr(item ? item.type_titre : '') + '" placeholder="ex : Barathonien élite" style="' + S.input + '" />' +
      '</div>';
    }
    var label = type === 'theme' ? 'Image du thème' : 'Image de la décoration';
    var imgFieldName = type === 'theme' ? 'type_them' : 'type_decoration_avatar';
    var existingImg  = item ? (type === 'theme' ? item.type_them : item.type_decoration_avatar) : null;
    var preview = existingImg
      ? '<img src="' + PB_URL + '/api/files/' + item.collectionName + '/' + item.id + '/' + existingImg + '" style="width:100%; height:120px; object-fit:cover; border-radius:8px; margin-bottom:8px; display:block;" />'
      : '';
    return '<div id="f-conditional" style="' + S.group + '">' +
      '<label style="' + S.label + '">' + label + (item && existingImg ? ' (remplacer)' : ' *') + '</label>' +
      preview +
      '<input id="f-img-boutique" type="file" accept="image/*" data-pb-field="' + imgFieldName + '" style="font-size:13px; color:#555;" />' +
    '</div>';
  }

  function openBoutiqueForm(id) {
    drawerMode = 'boutique';
    editingId  = id || null;
    var item   = id ? allBoutique.find(function (b) { return b.id === id; }) : null;

    document.getElementById('drawer-label').textContent = 'Boutique';
    document.getElementById('drawer-title').textContent = item ? 'Modifier l\'article' : 'Nouvel article';
    document.getElementById('drawer-error').style.display = 'none';

    document.getElementById('drawer-body').innerHTML =
      '<p style="' + S.section + '">Informations</p>' +
      field('nom', 'Nom de l\'article *', 'text', item ? item.nom : '', 'ex : Couronne de champion') +
      field('prix', 'Prix en points *', 'number', item ? item.prix : '', 'ex : 500') +
      '<div style="' + S.group + '">' +
        '<label for="f-type" style="' + S.label + '">Type *</label>' +
        boutiqueTypeSelect(item ? item.type : 'decoration_avatar') +
      '</div>' +
      '<p style="' + S.section + '">Contenu</p>' +
      boutiqueConditionalField(item);

    // Mise à jour dynamique du champ conditionnel au changement de type
    var typeSelect = document.getElementById('f-type');
    typeSelect.addEventListener('change', function () {
      var fakeItem = item ? Object.assign({}, item, { type: this.value }) : { type: this.value };
      document.getElementById('f-conditional').outerHTML = boutiqueConditionalField(fakeItem);
    });

    openDrawer();
  }

  async function submitBoutique() {
    var nom  = val('nom');
    var prix = val('prix');
    var type = document.getElementById('f-type').value;
    if (!nom)  throw new Error('Le nom est obligatoire.');
    if (!prix) throw new Error('Le prix est obligatoire.');

    var fd = new FormData();
    fd.append('nom',  nom);
    fd.append('prix', prix);
    fd.append('type', type);

    if (type === 'titre') {
      var titreTxt = document.getElementById('f-type-titre');
      if (!titreTxt || !titreTxt.value.trim()) throw new Error('Le texte du titre est obligatoire.');
      fd.append('type_titre', titreTxt.value.trim());
    } else {
      var imgInput = document.getElementById('f-img-boutique');
      var pbField  = imgInput ? imgInput.dataset.pbField : null;
      if (imgInput && imgInput.files && imgInput.files[0] && pbField) {
        fd.append(pbField, imgInput.files[0]);
      } else if (!editingId) {
        throw new Error('Une image est obligatoire pour ce type d\'article.');
      }
    }

    var res = await fetch(
      PB_URL + '/api/collections/boutique/records' + (editingId ? '/' + editingId : ''),
      { method: editingId ? 'PATCH' : 'POST', headers: { Authorization: 'Bearer ' + TOKEN }, body: fd }
    );
    if (!res.ok) throw new Error((await res.json()).message || 'Erreur PocketBase.');
  }

  // ── Delete helpers ────────────────────────────────────────────────────────
  async function deleteRecord(collection, id, rowAttr) {
    var res = await fetch(PB_URL + '/api/collections/' + collection + '/records/' + id, {
      method: 'DELETE', headers: { Authorization: 'Bearer ' + TOKEN },
    });
    if (res.ok) {
      var row = document.querySelector('[' + rowAttr + '="' + id + '"]');
      if (row) row.remove();
    }
  }

  // ── Toggle admin ──────────────────────────────────────────────────────────
  async function toggleAdmin(id, currentAdmin, btn) {
    var newVal = !currentAdmin;
    var res = await fetch(PB_URL + '/api/collections/users/records/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
      body: JSON.stringify({ admin: newVal }),
    });
    if (res.ok) {
      btn.dataset.admin    = String(newVal);
      btn.textContent      = newVal ? 'Admin' : 'User';
      btn.style.background = newVal ? '#edf7ee' : '#f3f4f6';
      btn.style.color      = newVal ? '#347645' : '#888';
    }
  }

  // ── Jeu : modifier infos ──────────────────────────────────────────────────
  function openJeuForm(id) {
    drawerMode = 'jeu';
    editingId  = id;
    var jeu = allJeux.find(function (j) { return j.id === id; });
    if (!jeu) return;

    document.getElementById('drawer-label').textContent = 'Jeux';
    document.getElementById('drawer-title').textContent = 'Modifier le jeu';
    document.getElementById('drawer-error').style.display = 'none';

    var imgPreview = jeu.img
      ? '<img src="' + PB_URL + '/api/files/' + jeu.collectionName + '/' + jeu.id + '/' + jeu.img
        + '" style="width:100%; height:140px; object-fit:cover; border-radius:8px; margin-bottom:8px; display:block;" />'
      : '';

    document.getElementById('drawer-body').innerHTML =
      '<p style="' + S.section + '">Informations</p>' +
      field('nom',         'Nom du jeu *',  'text', jeu.nom) +
      area ('description', 'Description',           jeu.description) +
      '<p style="' + S.section + '">Image</p>' +
      '<div style="' + S.group + '">' + imgPreview +
        '<label style="' + S.label + '">' + (jeu.img ? 'Remplacer l\'image' : 'Choisir une image') + '</label>' +
        '<input id="f-img" type="file" accept="image/*" style="font-size:13px; color:#555;" />' +
      '</div>';

    openDrawer();
  }

  async function submitJeu() {
    var nom = val('nom');
    if (!nom) throw new Error('Le nom est obligatoire.');
    var fd = new FormData();
    fd.append('nom', nom);
    fd.append('description', val('description'));
    var imgFile = fileVal('img');
    if (imgFile) fd.append('img', imgFile);
    var res = await fetch(PB_URL + '/api/collections/jeux/records/' + editingId,
      { method: 'PATCH', headers: { Authorization: 'Bearer ' + TOKEN }, body: fd });
    if (!res.ok) throw new Error((await res.json()).message || 'Erreur PocketBase.');
    var updated = await res.json();
    // Update local cache
    var idx = allJeux.findIndex(function (j) { return j.id === editingId; });
    if (idx >= 0) allJeux[idx].nom = updated.nom ?? allJeux[idx].nom;
    // Update row in DOM
    var row = document.querySelector('[data-row-jeu="' + editingId + '"]');
    if (row) row.querySelector('p').textContent = updated.nom ?? nom;
  }

  // ── Jeu : questions ───────────────────────────────────────────────────────
  var currentJeuId = null;

  function openJeuQuestions(jeuId) {
    currentJeuId = jeuId;
    var jeu = allJeux.find(function (j) { return j.id === jeuId; });
    document.getElementById('jeu-questions-title').textContent = jeu ? jeu.nom : 'Questions';

    renderQuestionsList();
    switchSection('jeu-questions');
    // Highlight jeux nav item
    document.querySelectorAll('.nav-item').forEach(function (b) {
      b.style.background = b.dataset.section === 'jeux' ? 'rgba(114,192,115,0.15)' : 'transparent';
      b.style.color      = b.dataset.section === 'jeux' ? '#72c073' : 'rgba(247,241,237,0.55)';
    });
  }

  var themeOptions = [
    { value: 'cultrue_g',  label: 'Culture générale' },
    { value: 'jeux_video', label: 'Jeux vidéo'        },
    { value: 'histoire',   label: 'Histoire'           },
  ];

  function openQuestionForm(id) {
    drawerMode = 'question';
    editingId  = id;
    var q = allQuestions.find(function (q) { return q.id === id; });
    if (!q) return;

    document.getElementById('drawer-label').textContent = 'Questions';
    document.getElementById('drawer-title').textContent = 'Modifier la question';
    document.getElementById('drawer-error').style.display = 'none';

    var choixFields = [1,2,3,4].map(function (n) {
      return '<div style="' + S.group + '">' +
        '<label style="' + S.label + '">Choix ' + n + '</label>' +
        '<input id="dq-choix-' + n + '" type="text" value="' + escAttr(q['choix_' + n]) + '" style="' + S.input + '" /></div>';
    }).join('');

    var themeSelect = '<select id="dq-theme" style="' + S.input + '">' +
      themeOptions.map(function (t) {
        return '<option value="' + t.value + '"' + (q.theme === t.value ? ' selected' : '') + '>' + t.label + '</option>';
      }).join('') +
    '</select>';

    var reponseSelect = '<select id="dq-reponse" style="' + S.input + '">' +
      [1,2,3,4].map(function (n) {
        return '<option value="' + n + '"' + (q.reponse === n - 1 ? ' selected' : '') + '>Choix ' + n + '</option>';
      }).join('') +
    '</select>';

    document.getElementById('drawer-body').innerHTML =
      '<p style="' + S.section + '">Question</p>' +
      '<div style="' + S.group + '">' +
        '<label style="' + S.label + '">Intitulé *</label>' +
        '<input id="dq-question" type="text" value="' + escAttr(q.question) + '" style="' + S.input + '" />' +
      '</div>' +
      '<p style="' + S.section + '">Choix de réponses</p>' +
      '<div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">' + choixFields + '</div>' +
      '<p style="' + S.section + '">Paramètres</p>' +
      '<div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">' +
        '<div style="' + S.group + '"><label style="' + S.label + '">Bonne réponse</label>' + reponseSelect + '</div>' +
        '<div style="' + S.group + '"><label style="' + S.label + '">Thème</label>' + themeSelect + '</div>' +
      '</div>';

    openDrawer();
  }

  async function submitQuestion() {
    var question = document.getElementById('dq-question').value.trim();
    var c1 = document.getElementById('dq-choix-1').value.trim();
    var c2 = document.getElementById('dq-choix-2').value.trim();
    var c3 = document.getElementById('dq-choix-3').value.trim();
    var c4 = document.getElementById('dq-choix-4').value.trim();
    var rep   = parseInt(document.getElementById('dq-reponse').value);
    var theme = document.getElementById('dq-theme').value;

    if (!question || !c1 || !c2 || !c3 || !c4) throw new Error('Tous les champs sont obligatoires.');

    var res = await fetch(PB_URL + '/api/collections/jeux_questionaire/records/' + editingId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
      body: JSON.stringify({
        question: question,
        choix_1: c1, choix_2: c2, choix_3: c3, choix_4: c4,
        reponse_1: rep === 1, reponse_2: rep === 2, reponse_3: rep === 3, reponse_4: rep === 4,
        theme: theme,
      }),
    });
    if (!res.ok) throw new Error((await res.json()).message || 'Erreur PocketBase.');

    // Mettre à jour le cache local
    var idx = allQuestions.findIndex(function (q) { return q.id === editingId; });
    if (idx >= 0) allQuestions[idx] = {
      id: editingId, question: question,
      choix_1: c1, choix_2: c2, choix_3: c3, choix_4: c4,
      reponse: rep - 1, theme: theme,
    };
    renderQuestionsList();
  }

  function renderQuestionsList() {
    var list      = document.getElementById('questions-list');
    var countEl   = document.getElementById('jeu-questions-count');
    var questions = allQuestions; // show all, no filter by jeu since relation is by theme
    countEl.textContent = questions.length + ' question' + (questions.length > 1 ? 's' : '');

    var themeLabels = { cultrue_g: 'Culture générale', jeux_video: 'Jeux vidéo', histoire: 'Histoire' };

    if (questions.length === 0) {
      list.innerHTML = '<p style="color:#bbb; font-size:14px; padding:20px;">Aucune question.</p>';
      return;
    }

    var header = '<div style="display:grid; grid-template-columns:1fr 130px 60px; padding:12px 20px; background:#f9fafb; border-bottom:1px solid #e8eaed;">' +
      '<p style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#aaa; margin:0;">Question</p>' +
      '<p style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#aaa; margin:0;">Thème</p>' +
      '<p style="margin:0;"></p>' +
      '</div>';

    var rows = questions.map(function (q) {
      var themeLabel = themeLabels[q.theme] || q.theme;
      var correctLabel = ['Choix 1', 'Choix 2', 'Choix 3', 'Choix 4'][q.reponse] || '—';
      return '<div style="display:grid; grid-template-columns:1fr 130px 60px; align-items:center; padding:14px 20px; border-bottom:1px solid #f3f4f6;">' +
        '<div>' +
          '<p style="font-size:14px; font-weight:600; color:#222; margin:0 0 3px;">' + escText(q.question) + '</p>' +
          '<p style="font-size:11px; color:#aaa; margin:0;">Réponse : <strong style="color:#347645;">' + escText(correctLabel) + '</strong> — ' + escText(q.choix_1) + ' / ' + escText(q.choix_2) + ' / ' + escText(q.choix_3) + ' / ' + escText(q.choix_4) + '</p>' +
        '</div>' +
        '<span style="font-size:11px; font-weight:600; color:#7c3aed; background:#f5f3ff; padding:3px 10px; border-radius:20px; width:fit-content;">' + escText(themeLabel) + '</span>' +
        '<div style="display:flex; justify-content:flex-end; gap:6px;">' +
          '<button data-action="edit-question" data-id="' + q.id + '" style="height:28px; padding:0 12px; background:#f0fdf4; border:1px solid #d1fae5; color:#347645; font-size:12px; font-weight:600; cursor:pointer; border-radius:6px;">Modifier</button>' +
          '<button data-action="delete-question" data-id="' + q.id + '" style="height:28px; padding:0 12px; background:#fff5f5; border:1px solid #fecaca; color:#ef4444; font-size:12px; font-weight:600; cursor:pointer; border-radius:6px;">Supp.</button>' +
        '</div>' +
      '</div>';
    }).join('');

    list.innerHTML = header + rows;
  }

  async function deleteQuestion(id) {
    var res = await fetch(PB_URL + '/api/collections/jeux_questionaire/records/' + id, {
      method: 'DELETE', headers: { Authorization: 'Bearer ' + TOKEN },
    });
    if (res.ok) {
      allQuestions = allQuestions.filter(function (q) { return q.id !== id; });
      renderQuestionsList();
    }
  }

  // ── Ajouter question ──────────────────────────────────────────────────────
  document.getElementById('btn-add-question').addEventListener('click', async function () {
    var btn   = this;
    var errEl = document.getElementById('add-question-error');
    errEl.style.display = 'none';

    var question = document.getElementById('q-question').value.trim();
    var c1 = document.getElementById('q-choix-1').value.trim();
    var c2 = document.getElementById('q-choix-2').value.trim();
    var c3 = document.getElementById('q-choix-3').value.trim();
    var c4 = document.getElementById('q-choix-4').value.trim();
    var rep  = parseInt(document.getElementById('q-reponse').value);
    var theme = document.getElementById('q-theme').value;

    if (!question || !c1 || !c2 || !c3 || !c4) {
      errEl.textContent = 'La question et les 4 choix sont obligatoires.';
      errEl.style.display = 'block';
      return;
    }

    btn.disabled = true; btn.textContent = 'Ajout…';
    try {
      var body = {
        question: question,
        choix_1: c1, choix_2: c2, choix_3: c3, choix_4: c4,
        reponse_1: rep === 1, reponse_2: rep === 2, reponse_3: rep === 3, reponse_4: rep === 4,
        theme: theme,
      };
      var res = await fetch(PB_URL + '/api/collections/jeux_questionaire/records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).message || 'Erreur.');
      var created = await res.json();
      allQuestions.push({
        id: created.id, question: question,
        choix_1: c1, choix_2: c2, choix_3: c3, choix_4: c4,
        reponse: rep - 1, theme: theme,
      });
      renderQuestionsList();
      // Reset form
      document.getElementById('q-question').value = '';
      document.getElementById('q-choix-1').value  = '';
      document.getElementById('q-choix-2').value  = '';
      document.getElementById('q-choix-3').value  = '';
      document.getElementById('q-choix-4').value  = '';
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
    } finally {
      btn.disabled = false; btn.textContent = 'Ajouter la question';
    }
  });

  // ── Event delegation ──────────────────────────────────────────────────────
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.dataset.action;
    var id     = btn.dataset.id;

    if (action === 'open-bar-form') {
      openBarForm(id);
    } else if (action === 'open-boison-form') {
      openBoisonForm(id);
    } else if (action === 'open-jeu-form') {
      openJeuForm(id);
    } else if (action === 'open-jeu-questions') {
      openJeuQuestions(id);
    } else if (action === 'back-to-jeux') {
      switchSection('jeux');
    } else if (action === 'edit-question') {
      openQuestionForm(id);
    } else if (action === 'delete-question') {
      openConfirm('Supprimer la question',
        'Cette question sera définitivement supprimée.',
        function () { return deleteQuestion(id); });
    } else if (action === 'delete-user') {
      openConfirm('Supprimer l\'utilisateur',
        'Le compte et toutes ses données seront définitivement supprimés.',
        function () { return deleteRecord('users', id, 'data-row-user'); });
    } else if (action === 'toggle-admin') {
      var isAdmin = btn.dataset.admin === 'true';
      openConfirm(
        isAdmin ? 'Retirer les droits admin' : 'Donner les droits admin',
        isAdmin ? 'Cet utilisateur ne pourra plus accéder au panneau d\'administration.'
                : 'Cet utilisateur pourra accéder au panneau d\'administration.',
        function () { return toggleAdmin(id, isAdmin, btn); });
    } else if (action === 'delete-bar') {
      openConfirm('Supprimer le bar',
        'Ce bar sera définitivement supprimé.',
        function () { return deleteRecord('bar', id, 'data-row-bar'); });
    } else if (action === 'delete-session') {
      openConfirm('Supprimer la session',
        'Cette session et toutes ses données seront définitivement supprimées.',
        function () { return deleteRecord('session_barathon', id, 'data-row-session'); });
    } else if (action === 'delete-boison') {
      openConfirm('Supprimer la boisson',
        'Cette boisson sera définitivement supprimée.',
        function () { return deleteRecord('boison', id, 'data-row-boison'); });
    } else if (action === 'open-boutique-form') {
      openBoutiqueForm(id);
    } else if (action === 'delete-boutique') {
      openConfirm('Supprimer l\'article',
        'Cet article de boutique sera définitivement supprimé.',
        function () { return deleteRecord('boutique', id, 'data-row-boutique'); });
    }
  });
})();
