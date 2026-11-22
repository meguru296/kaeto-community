(function () {
  'use strict';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var opening = document.querySelector('.dt-opening');
  var timer, closingTimer, returnFocus;
  function finishOpening(immediate) {
    clearTimeout(timer); clearTimeout(closingTimer);
    if (!opening || !opening.open) return;
    function close() { opening.close(); document.body.classList.remove('dt-opening-open'); opening.classList.remove('is-leaving'); if (returnFocus) returnFocus.focus({ preventScroll: true }); returnFocus = null; }
    if (immediate || reduced.matches) close();
    else { opening.classList.add('is-leaving'); closingTimer = setTimeout(close, 250); }
  }
  function playOpening(manual) {
    if (!opening || typeof opening.showModal !== 'function' || opening.open) return;
    if (reduced.matches) return;
    returnFocus = manual ? document.activeElement : null;
    opening.classList.remove('is-leaving');
    opening.showModal(); document.body.classList.add('dt-opening-open');
    timer = setTimeout(function () { finishOpening(false); }, 1100);
  }
  if (opening) {
    opening.querySelector('[data-skip-opening]').addEventListener('click', function () { finishOpening(true); });
    opening.addEventListener('cancel', function (event) { event.preventDefault(); finishOpening(true); });
    opening.addEventListener('close', function () { clearTimeout(timer); clearTimeout(closingTimer); document.body.classList.remove('dt-opening-open'); });
    document.querySelectorAll('[data-replay-opening]').forEach(function (button) { button.addEventListener('click', function () { playOpening(true); }); });
    try { if (!sessionStorage.getItem('tangtang-opening-v2')) { sessionStorage.setItem('tangtang-opening-v2', 'seen'); playOpening(false); } } catch (_) { /* Private storage: leave the page immediately usable. */ }
  }
  // Scroll-linked artwork movement is confined to visible hero scenes.
  var scenes = Array.from(document.querySelectorAll('.dt-home-art,.dt-event-art'));
  var pending = false;
  function scrollArt() {
    pending = false;
    scenes.forEach(function (scene) {
      if (reduced.matches) { scene.style.removeProperty('translate'); return; }
      var rect = scene.parentElement.getBoundingClientRect();
      if (rect.bottom > 0 && rect.top < innerHeight) scene.style.translate = '0 ' + Math.min(35, Math.max(-35, -rect.top * .045)) + 'px';
    });
  }
  window.addEventListener('scroll', function () { if (!pending) { pending = true; requestAnimationFrame(scrollArt); } }, { passive: true });
  reduced.addEventListener('change', function () { if (reduced.matches) finishOpening(true); scrollArt(); });
  // Very small pointer tilt; no effect on reading or form controls.
  document.querySelectorAll('[data-tilt]').forEach(function (scene) {
    var book = scene.querySelector('.dt-book');
    scene.addEventListener('pointermove', function (event) {
      if (reduced.matches || event.pointerType !== 'mouse') return;
      var rect = scene.getBoundingClientRect();
      var x = ((event.clientX - rect.left) / rect.width - .5) * 13;
      var y = ((event.clientY - rect.top) / rect.height - .5) * -8;
      book.style.transform = 'translateY(-9px) rotate(-3deg) rotateY(' + x + 'deg) rotateX(' + y + 'deg)';
    });
    scene.addEventListener('pointerleave', function () { book.style.removeProperty('transform'); });
  });
})();
