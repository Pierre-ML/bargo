// @ts-nocheck
(function () {
  var btn   = document.getElementById('notif-btn');
  var panel = document.getElementById('notif-panel');

  if (!btn || !panel) return;

  function openPanel() {
    panel.classList.remove('hidden');
    panel.classList.add('flex');
    btn.setAttribute('aria-expanded', 'true');
  }
  function closePanel() {
    panel.classList.remove('flex');
    panel.classList.add('hidden');
    btn.setAttribute('aria-expanded', 'false');
  }

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    panel.classList.contains('hidden') ? openPanel() : closePanel();
  });

  document.addEventListener('click', function (e) {
    var widget = document.getElementById('notif-widget');
    if (widget && !widget.contains(e.target instanceof Node ? e.target : null)) {
      closePanel();
    }
  });
})();
