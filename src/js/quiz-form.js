// @ts-nocheck
// Logique du formulaire de sélection du quiz (jeux_questionaire/index.astro)
(function () {
  var form = document.getElementById('quiz-form');
  form && form.addEventListener('submit', function (e) {
    e.preventDefault();
    var checked = form.querySelectorAll('input[name="themes"]:checked');
    if (checked.length === 0) {
      document.getElementById('theme-error')?.classList.remove('hidden');
      return;
    }
    document.getElementById('theme-error')?.classList.add('hidden');
    var themes    = Array.from(checked).map(function (cb) { return cb.value; }).join(',');
    var time      = form.querySelector('input[name="time"]:checked')?.value ?? '20';
    var sessionId = new URL(window.location.href).searchParams.get('session') ?? '';
    var sessionParam = sessionId ? '&session=' + encodeURIComponent(sessionId) : '';
    window.location.href = '/jeux_questionaire/jouer?themes=' + encodeURIComponent(themes) + '&time=' + time + sessionParam;
  });

  var checkboxes = document.querySelectorAll('input[name="themes"]');
  var btnAll     = document.getElementById('btn-all-themes');

  function syncAllBtn() {
    var allChecked = Array.from(checkboxes).every(function (cb) { return cb.checked; });
    btnAll.style.background = allChecked ? '#1E1E1E' : '';
    btnAll.style.color      = allChecked ? 'white'   : '';
  }

  btnAll && btnAll.addEventListener('click', function () {
    var allChecked = Array.from(checkboxes).every(function (cb) { return cb.checked; });
    checkboxes.forEach(function (cb) { cb.checked = !allChecked; });
    syncAllBtn();
    document.getElementById('theme-error')?.classList.add('hidden');
  });

  checkboxes.forEach(function (cb) {
    cb.addEventListener('change', function () {
      syncAllBtn();
      document.getElementById('theme-error')?.classList.add('hidden');
    });
  });
})();
