(function () {
  'use strict';
  var doc = document;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var timers = new Map();
  function animateSticker(el) {
    if (!el || !el.dataset.animated || reduced.matches) return;
    if (!el.dataset.still) el.dataset.still = el.getAttribute('src');
    clearTimeout(timers.get(el));
    el.src = el.dataset.animated;
    timers.set(el, setTimeout(function () { el.src = el.dataset.still; timers.delete(el); }, 5000));
  }
  reduced.addEventListener('change', function () {
    if (!reduced.matches) return;
    timers.forEach(function (timer, el) { clearTimeout(timer); el.src = el.dataset.still; });
    timers.clear();
  });

  var tabs = Array.from(doc.querySelectorAll('[data-format]'));
  function selectFormat(button) {
    tabs.forEach(function (tab) {
      var active = tab === button;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      var panel = doc.getElementById('format-' + tab.dataset.format);
      panel.hidden = !active;
      if (active) animateSticker(panel.querySelector('[data-animated]'));
    });
  }
  tabs.forEach(function (tab, i) {
    tab.addEventListener('click', function () { selectFormat(tab); });
    tab.addEventListener('keydown', function (event) {
      var next;
      if (event.key === 'ArrowRight') next = (i + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (i + tabs.length - 1) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next !== undefined) { event.preventDefault(); selectFormat(tabs[next]); tabs[next].focus(); }
    });
  });

  doc.querySelectorAll('[data-reading-filter]').forEach(function (button) {
    button.addEventListener('click', function () {
      doc.querySelectorAll('[data-reading-filter]').forEach(function (b) { b.setAttribute('aria-pressed', String(b === button)); });
      doc.querySelectorAll('[data-reading-category]').forEach(function (card) {
        card.hidden = button.dataset.readingFilter !== 'all' && card.dataset.readingCategory !== button.dataset.readingFilter;
        if (!card.hidden) card.classList.remove('reveal-pending');
      });
    });
  });

  var reader = doc.querySelector('[data-reader]');
  if (reader) {
    var pages = Array.from(reader.querySelectorAll('[data-reader-page]'));
    var select = reader.querySelector('[data-reader-select]');
    var prev = reader.querySelector('[data-reader-prev]');
    var next = reader.querySelector('[data-reader-next]');
    var mode = reader.querySelector('[data-reader-mode]');
    var status = reader.querySelector('.reader-page-status');
    var container = reader.querySelector('.reader-pages');
    var index = 0, continuous = false;
    var key = 'tangtang-reader-' + reader.dataset.slug;
    try { index = Math.max(0, Math.min(pages.length - 1, Number(localStorage.getItem(key)) || 0)); } catch (_) {}
    function update(turn) {
      pages.forEach(function (p, i) { p.hidden = !continuous && i !== index; });
      select.value = String(index);
      prev.disabled = continuous || index === 0;
      next.disabled = continuous || index === pages.length - 1;
      select.disabled = continuous;
      mode.setAttribute('aria-pressed', String(continuous));
      mode.textContent = continuous ? '切换单页' : '连续阅读';
      status.textContent = continuous ? '连续阅读模式' : '点击版面可放大';
      if (turn && !reduced.matches) {
        container.classList.remove('is-turning'); void container.offsetWidth; container.classList.add('is-turning');
      }
      try { localStorage.setItem(key, String(index)); } catch (_) {}
    }
    function changePage(n) { index = Math.max(0, Math.min(pages.length - 1, n)); update(true); }
    prev.addEventListener('click', function () { changePage(index - 1); });
    next.addEventListener('click', function () { changePage(index + 1); });
    select.addEventListener('change', function () { changePage(Number(select.value)); });
    mode.addEventListener('click', function () { continuous = !continuous; update(true); });
    doc.addEventListener('keydown', function (event) {
      if (continuous || doc.querySelector('dialog[open]') || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(doc.activeElement.tagName) || event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'ArrowLeft') { event.preventDefault(); changePage(index - 1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); changePage(index + 1); }
    });
    update(false);
  }

  doc.querySelectorAll('[data-copy-group]').forEach(function (button) {
    var group = button.dataset.copyGroup;
    if (!group) return;
    button.addEventListener('click', async function () {
      var feedback = button.parentElement.querySelector('.copy-feedback');
      var copied = false;
      try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(group); copied = true; } } catch (_) {}
      if (!copied) {
        var field = doc.createElement('textarea'); field.value = group; field.setAttribute('aria-label', '交流群号'); field.style.cssText = 'position:fixed;left:-9999px;top:0';
        doc.body.appendChild(field); field.select();
        try { copied = doc.execCommand('copy'); } catch (_) {}
        field.remove(); button.focus();
      }
      if (feedback) feedback.textContent = copied ? '已复制 · ' + group : '交流群号：' + group + '，可手动复制。';
      button.textContent = copied ? '群号已复制 ✓' : '交流群号 ' + group;
    });
  });

  var stampButton = doc.querySelector('[data-stamp]');
  if (stampButton) stampButton.addEventListener('click', function () {
    var result = doc.querySelector('.stamp-result');
    result.classList.remove('is-stamped'); void result.offsetWidth; result.classList.add('is-stamped');
    result.querySelector('span').textContent = '星标已盖章。今天的故事，也要好好记住哦。';
    stampButton.textContent = '再盖一次 ✳';
  });

  var toggle = doc.querySelector('.mascot-toggle');
  var message = doc.querySelector('.mascot-message');
  var quips = ['来都来了，留下一点你的故事吧。', '只收藏不开始？你的下一部神作可要等急了。', '打几分都可以，喜欢的理由只有你自己知道。', '本群娘已经准备好听你的通关感想了。'];
  var quipIndex = 0;
  function closeMascot() {
    if (!toggle || !message) return;
    message.hidden = true; toggle.setAttribute('aria-expanded', 'false');
    var sticker = message.querySelector('[data-animated]');
    clearTimeout(timers.get(sticker)); timers.delete(sticker);
    if (sticker.dataset.still) sticker.src = sticker.dataset.still;
  }
  if (toggle && message) {
    toggle.addEventListener('click', function () {
      var open = toggle.getAttribute('aria-expanded') !== 'true';
      if (!open) { closeMascot(); return; }
      toggle.setAttribute('aria-expanded', 'true'); message.hidden = false;
      message.querySelector('[data-mascot-quip]').textContent = quips[quipIndex++ % quips.length];
      animateSticker(message.querySelector('[data-animated]'));
    });
    message.querySelector('.mascot-close').addEventListener('click', function () { closeMascot(); toggle.focus(); });
    doc.addEventListener('keydown', function (event) { if (event.key === 'Escape') closeMascot(); });
    doc.addEventListener('click', function (event) { if (!event.target.closest('.mascot-widget')) closeMascot(); });
  }

  doc.querySelectorAll('[data-parallax]').forEach(function (hero) {
    var art = hero.querySelector('[data-parallax-art]');
    if (!art) return;
    hero.addEventListener('pointermove', function (event) {
      if (reduced.matches || event.pointerType !== 'mouse' || window.innerWidth < 900) return;
      var rect = hero.getBoundingClientRect();
      art.style.setProperty('--pointer-x', ((event.clientX - rect.left) / rect.width - .5) * 12 + 'px');
      art.style.setProperty('--pointer-y', ((event.clientY - rect.top) / rect.height - .5) * 10 + 'px');
    });
    hero.addEventListener('pointerleave', function () { art.style.setProperty('--pointer-x', '0px'); art.style.setProperty('--pointer-y', '0px'); });
  });
})();
