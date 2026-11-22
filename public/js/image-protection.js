(function () {
  'use strict';
  function isImage(target) { return target.closest('img,svg image,[data-image-protected]'); }
  function allowed(target) { return !!target.closest('#gallery,.dt-art-gallery,[data-image-download="allow"]') || target.closest('.poster-dialog') && document.querySelector('.poster-dialog').dataset.imageDownload === 'allow'; }
  document.addEventListener('contextmenu', function (event) { if (isImage(event.target) && !allowed(event.target)) event.preventDefault(); });
  document.addEventListener('dragstart', function (event) { if (isImage(event.target) && !allowed(event.target)) event.preventDefault(); });
  document.addEventListener('click', function (event) {
    var trigger = event.target.closest('[data-poster]');
    if (!trigger) return;
    var dialog = document.querySelector('.poster-dialog');
    if (dialog) dialog.dataset.imageDownload = trigger.closest('#gallery,.dt-art-gallery') ? 'allow' : 'block';
  }, true);
})();
