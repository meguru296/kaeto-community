(function () {
  'use strict';
  var doc = document;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var introTimer;
  function intro() {
    if (reduced.matches) return;
    doc.body.classList.remove('intro-play');
    void doc.body.offsetWidth;
    doc.body.classList.add('intro-play');
    clearTimeout(introTimer);
    introTimer = setTimeout(function () { doc.body.classList.remove('intro-play'); }, 1600);
  }
  try {
    if (!sessionStorage.getItem('tangtang-intro-' + location.pathname)) {
      intro();
      sessionStorage.setItem('tangtang-intro-' + location.pathname, 'seen');
    }
  } catch (_) { intro(); }
  var replay = doc.querySelector('[data-replay]');
  if (replay) replay.addEventListener('click', intro);

  var reveals = Array.from(doc.querySelectorAll('[data-reveal]'));
  var observer;
  if (!reduced.matches && 'IntersectionObserver' in window) {
    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.remove('reveal-pending');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.06, rootMargin: '0px 0px -25px 0px' });
    reveals.forEach(function (element) {
      if (element.getBoundingClientRect().top > window.innerHeight - 25) element.classList.add('reveal-pending');
      observer.observe(element);
    });
    doc.documentElement.classList.add('motion-ready');
  }
  // 内容默认可读；开启减少动态效果后立即解除待入场状态。
  reduced.addEventListener('change', function () {
    if (reduced.matches) {
      if (observer) observer.disconnect();
      reveals.forEach(function (el) { el.classList.remove('reveal-pending'); });
      doc.body.classList.remove('intro-play');
    }
  });

  var menu = doc.querySelector('.menu-toggle');
  var nav = doc.querySelector('#site-navigation');
  function closeMenu() {
    if (!menu || !nav) return;
    nav.classList.remove('is-open');
    menu.setAttribute('aria-expanded', 'false');
    menu.setAttribute('aria-label', '展开导航');
  }
  if (menu && nav) {
    menu.addEventListener('click', function () {
      var open = menu.getAttribute('aria-expanded') !== 'true';
      menu.setAttribute('aria-expanded', String(open));
      menu.setAttribute('aria-label', open ? '收起导航' : '展开导航');
      nav.classList.toggle('is-open', open);
    });
    doc.addEventListener('keydown', function (event) { if (event.key === 'Escape') closeMenu(); });
    doc.addEventListener('click', function (event) { if (!event.target.closest('.topbar')) closeMenu(); });
  }

  var progress = doc.querySelector('.reading-progress');
  var queued = false;
  function updateScroll() {
    var distance = doc.documentElement.scrollHeight - window.innerHeight;
    if (progress) progress.style.transform = 'scaleX(' + (distance > 0 ? Math.min(1, Math.max(0, window.scrollY / distance)) : 0) + ')';
    queued = false;
  }
  window.addEventListener('scroll', function () {
    if (!queued) { queued = true; requestAnimationFrame(updateScroll); }
  }, { passive: true });
  window.addEventListener('resize', updateScroll);
  updateScroll();

  var hero = doc.querySelector('.home-hero');
  var art = doc.querySelector('.hero-art');
  if (hero && art) {
    hero.addEventListener('pointermove', function (event) {
      if (reduced.matches || event.pointerType !== 'mouse' || window.innerWidth < 900) return;
      var rect = hero.getBoundingClientRect();
      art.style.setProperty('--pointer-x', ((event.clientX - rect.left) / rect.width - 0.5) * 8 + 'px');
      art.style.setProperty('--pointer-y', ((event.clientY - rect.top) / rect.height - 0.5) * 6 + 'px');
    });
    hero.addEventListener('pointerleave', function () {
      art.style.setProperty('--pointer-x', '0px'); art.style.setProperty('--pointer-y', '0px');
    });
  }

  var dialog = doc.querySelector('.poster-dialog');
  if (dialog && typeof dialog.showModal === 'function') {
    var image = dialog.querySelector('.poster-dialog-image');
    var label = dialog.querySelector('#poster-dialog-label');
    var privateImageUrl = '';
    doc.addEventListener('click', async function (event) {
        var button=event.target.closest('[data-reveal-cover]');if(!button||button.disabled)return;
        var note = button.parentElement.querySelector('.wd-cover-note');
        button.disabled = true;
        if (note) note.textContent = '正在加载原图…';
        try {
          var response = await fetch(button.dataset.revealCover, { cache: 'no-store' });
          if (!response.ok) throw new Error(response.status === 401 ? '登录已失效，请重新登录后查看。' : '原图暂时无法加载，请稍后再试。');
          if (privateImageUrl) URL.revokeObjectURL(privateImageUrl);
          privateImageUrl = URL.createObjectURL(await response.blob());
          image.src = privateImageUrl;
          image.alt = button.dataset.posterLabel;
          label.textContent = button.dataset.posterLabel;
          dialog.dataset.imageDownload = 'block';
          dialog.classList.remove('is-zoomed');
          dialog.showModal();
          doc.body.classList.add('poster-open');
          if (note) note.textContent = '封面含成人画面，默认遮挡。';
        } catch (error) { if (note) note.textContent = error.message; }
        finally { button.disabled = false; }
    });
    doc.addEventListener('click', function (event) {
        var button=event.target.closest('[data-poster]');if(!button||button.disabled||!button.dataset.poster)return;
        image.src = button.dataset.poster;
        image.alt = button.dataset.posterLabel;
        label.textContent = button.dataset.posterLabel;
        dialog.classList.remove('is-zoomed');
        dialog.showModal();
        doc.body.classList.add('poster-open');
    });
    dialog.querySelector('[data-close-poster]').addEventListener('click', function () { dialog.close(); });
    function toggleZoom() { dialog.classList.toggle('is-zoomed'); }
    image.addEventListener('click', toggleZoom);
    image.addEventListener('keydown', function (event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleZoom(); } });
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) {
        var rect = dialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
      }
    });
    dialog.addEventListener('close', function () {
      doc.body.classList.remove('poster-open');
      image.removeAttribute('src');
      if (privateImageUrl) { URL.revokeObjectURL(privateImageUrl); privateImageUrl = ''; }
    });
  }
})();
