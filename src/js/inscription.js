// @ts-nocheck
// Page inscription — bouton vert quand tout est rempli et CGU cochées
const checkbox = document.getElementById('terms-checkbox');
const btn      = document.getElementById('submit-btn');
const fields   = ['nom', 'pseudo', 'email', 'password', 'passwordConfirm'].map(n => document.querySelector(`[name="${n}"]`));

function updateBtn() {
  if (!checkbox || !btn) return;
  var allFilled = fields.every(function(el) { return el && el.value.trim().length > 0; });
  var pwdOk     = fields[3] && fields[4] && fields[3].value === fields[4].value && fields[3].value.length >= 8;
  var ready     = checkbox.checked && allFilled && pwdOk;
  btn.disabled  = !checkbox.checked;
  if (ready) {
    btn.classList.add('!bg-primary-500');
    btn.classList.remove('bg-primary-600');
  } else {
    btn.classList.remove('!bg-primary-500');
    btn.classList.add('bg-primary-600');
  }
}

if (checkbox) checkbox.addEventListener('change', updateBtn);
fields.forEach(function(el) { if (el) el.addEventListener('input', updateBtn); });
updateBtn();

// Validation côté client : les deux mots de passe doivent correspondre
const form = document.getElementById('inscription-form');
if (form) {
  form.addEventListener('submit', function(e) {
    const pwd     = form.querySelector('[name="password"]');
    const confirm = form.querySelector('[name="passwordConfirm"]');
    if (pwd && confirm && pwd.value !== confirm.value) {
      e.preventDefault();
      confirm.setCustomValidity('Les mots de passe ne correspondent pas.');
      confirm.reportValidity();
    } else if (confirm) {
      confirm.setCustomValidity('');
    }
  });
}
