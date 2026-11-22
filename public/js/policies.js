(function () {
  'use strict';
  var dialog = document.querySelector('[data-registration-notice]');
  var consent = document.querySelector('[data-policy-consent]');
  if (!dialog || !consent) return;
  var key = 'kaeto.registration-notice', version = dialog.dataset.registrationNotice;
  var saved = false;
  try { saved = localStorage.getItem(key) === version; } catch (_) { /* Storage is optional. */ }
  consent.checked = saved;
  function show() { if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal(); }
  function remember() { try { if (consent.checked) localStorage.setItem(key, version); else localStorage.removeItem(key); } catch (_) {} }
  document.querySelectorAll('[data-open-notice]').forEach(function (button) { button.addEventListener('click', show); });
  dialog.querySelector('[data-close-notice]').addEventListener('click', function () { dialog.close(); });
  dialog.querySelector('[data-accept-notice]').addEventListener('click', function () { consent.checked = true; remember(); dialog.close(); });
  consent.addEventListener('change', remember);
  if (!saved) show();
})();
