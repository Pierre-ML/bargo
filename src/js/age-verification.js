// @ts-nocheck
(function () {
  var overlay  = document.getElementById('age-overlay');
  var checkbox = document.getElementById('age-checkbox');
  var box      = document.getElementById('age-box');
  var icon     = document.getElementById('age-check-icon');
  var btn      = document.getElementById('age-confirm-btn');

  // Vérifier si déjà confirmé en session
  if (sessionStorage.getItem('age_confirmed') === '1') {
    if (overlay) overlay.style.display = 'none';
    return;
  }

  checkbox.addEventListener('change', function () {
    if (this.checked) {
      box.style.background = '#094736';
      box.style.borderColor = '#094736';
      icon.style.display = 'block';
      btn.disabled = false;
      btn.style.background = '#094736';
      btn.style.cursor = 'pointer';
    } else {
      box.style.background = 'white';
      box.style.borderColor = '#DFDFDF';
      icon.style.display = 'none';
      btn.disabled = true;
      btn.style.background = '#DFDFDF';
      btn.style.cursor = 'not-allowed';
    }
  });

  window.confirmAge = function () {
    if (!checkbox.checked) return;
    sessionStorage.setItem('age_confirmed', '1');
    overlay.style.display = 'none';
  };
})();
