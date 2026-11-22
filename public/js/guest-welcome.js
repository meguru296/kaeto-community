(function () {
  'use strict';
  var dialog = document.querySelector('[data-guest-welcome]');
  var authenticated = document.body.dataset.authenticated === '1';
  if (!authenticated && (!dialog || document.body.dataset.authenticated !== '0' || typeof dialog.showModal !== 'function' || document.querySelector('dialog[open]'))) return;
  var key = 'kaeto:guest-welcome:v1';
  // Remember once per browser. If persistent storage is unavailable, use the
  // current browsing session; if both are blocked, avoid repeatedly interrupting.
  var remembered = false;
  for (var i = 0; i < 2; i += 1) {
    try {
      var storage = i === 0 ? window.localStorage : window.sessionStorage;
      if (storage.getItem(key)) return;
      storage.setItem(key, '1');
      remembered = true;
      break;
    } catch (_) { /* Storage can be disabled by the browser. */ }
  }
  // Existing members also count as welcomed, so signing out does not nag them.
  if (authenticated || !remembered) return;
  dialog.querySelectorAll('[data-guest-welcome-dismiss]').forEach(function (button) {
    button.addEventListener('click', function () { dialog.close(); });
  });
  dialog.addEventListener('click', function (event) {
    if (event.target !== dialog) return;
    var rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  // Keep the global search shortcut from taking focus behind this modal.
  dialog.addEventListener('keydown', function (event) { if (event.key === '/') event.stopPropagation(); });
  dialog.showModal();
})();
