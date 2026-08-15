// @ts-nocheck
// Landing page — formulaire d'inscription section "Intéressé ?"

var btn    = document.getElementById('lp-reg-btn');
var msg    = document.getElementById('lp-reg-msg');
var inputs = ['lp-reg-pseudo', 'lp-reg-email', 'lp-reg-password', 'lp-reg-confirm'].map(id => document.getElementById(id));
var cguEl  = document.getElementById('lp-reg-cgu');
if (!btn) throw new Error('lp-reg-btn not found');

function checkReady() {
  var allFilled = inputs.every(function(el) { return el && el.value.trim().length > 0; });
  var pwdMatch  = inputs[2] && inputs[3] && inputs[2].value === inputs[3].value && inputs[2].value.length >= 8;
  var cguOk     = cguEl && cguEl.checked;
  if (allFilled && pwdMatch && cguOk) {
    btn.style.background  = '#72C073';
    btn.style.borderColor = '#72C073';
    btn.style.color       = '#fff';
  } else {
    btn.style.background  = '';
    btn.style.borderColor = '';
    btn.style.color       = '';
  }
}

inputs.forEach(function(el) { if (el) el.addEventListener('input', checkReady); });
if (cguEl) cguEl.addEventListener('change', checkReady);

function showMsg(text, ok) {
  msg.textContent = text;
  msg.classList.remove('hidden');
  msg.style.color = ok ? '#72C073' : '#f87171';
}

btn.addEventListener('click', async function () {
  var pseudo   = document.getElementById('lp-reg-pseudo').value.trim();
  var email    = document.getElementById('lp-reg-email').value.trim();
  var password = document.getElementById('lp-reg-password').value;
  var confirm  = document.getElementById('lp-reg-confirm').value;
  var cgu      = document.getElementById('lp-reg-cgu').checked;

  if (!pseudo || !email || !password || !confirm) { showMsg('Veuillez remplir tous les champs.', false); return; }
  if (password !== confirm)                       { showMsg('Les mots de passe ne correspondent pas.', false); return; }
  if (password.length < 8)                        { showMsg('Le mot de passe doit contenir au moins 8 caractères.', false); return; }
  if (!cgu)                                       { showMsg("Veuillez accepter les conditions d'utilisation.", false); return; }

  btn.disabled = true;
  btn.textContent = '...';

  try {
    var res = await fetch('https://pbbargo.pierre-mouilleseaux-lhuillier.fr/api/collections/users/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pseudo: pseudo, email: email, password: password, passwordConfirm: confirm })
    });
    var json = await res.json();
    if (!res.ok) {
      var detail = json?.data?.email?.message || json?.message || "Erreur lors de l'inscription.";
      showMsg(detail, false);
      btn.disabled = false;
      btn.textContent = "S'inscrire";
    } else {
      btn.style.background  = '#72C073';
      btn.style.borderColor = '#72C073';
      btn.style.color       = '#fff';
      btn.textContent       = '✓ Compte créé !';
      setTimeout(function () {
        var f  = document.createElement('form');
        f.method = 'POST';
        f.action = '/connexion';
        var ei = document.createElement('input'); ei.type = 'hidden'; ei.name = 'email';    ei.value = email;    f.appendChild(ei);
        var pi = document.createElement('input'); pi.type = 'hidden'; pi.name = 'password'; pi.value = password; f.appendChild(pi);
        document.body.appendChild(f);
        f.submit();
      }, 1000);
    }
  } catch (e) {
    showMsg('Erreur réseau. Réessayez.', false);
    btn.disabled = false;
    btn.textContent = "S'inscrire";
  }
});
