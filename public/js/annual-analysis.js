(function () {
  'use strict';
  var report = document.querySelector('[data-year-report]');
  if (!report) return;
  var panels = Array.from(report.querySelectorAll('[data-year-chapter]'));
  var dots = report.querySelectorAll('.ya-page-dots [data-year-target]');
  var current = 0, reduced = matchMedia('(prefers-reduced-motion: reduce)'), motion = !reduced.matches;
  var button = report.querySelector('[data-year-motion]'), frames = new Set();
  report.classList.add('ya-enhanced');
  function cancelCounters() { frames.forEach(cancelAnimationFrame); frames.clear(); }
  function count(panel) {
    cancelCounters();
    panel.querySelectorAll('[data-year-number]').forEach(function (element) {
      var value = Number(element.dataset.yearNumber), decimals = Number(element.dataset.yearDecimals), start;
      if (!motion) { element.textContent = value.toFixed(decimals); return; }
      function tick(now) {
        if (!start) start = now;
        var progress = Math.min(1, (now - start) / 950);
        element.textContent = (value * (1 - Math.pow(1 - progress, 3))).toFixed(decimals);
        if (progress < 1) { var frame = requestAnimationFrame(tick); frames.add(frame); }
      }
      var frame = requestAnimationFrame(tick); frames.add(frame);
    });
  }
  function show(index, changeHash) {
    index = Math.max(0, Math.min(panels.length - 1, index));
    report.querySelector('.ya-stage').classList.toggle('is-reversing', index < current);
    current = index;
    panels.forEach(function (panel, i) { panel.classList.toggle('is-active', i === current); panel.inert = i !== current; });
    dots.forEach(function (dot) { if (Number(dot.dataset.yearTarget) === current) dot.setAttribute('aria-current', 'step'); else dot.removeAttribute('aria-current'); });
    var previous = report.querySelector('[data-year-previous]'), next = report.querySelector('[data-year-next]');
    previous.setAttribute('aria-disabled', String(current === 0)); previous.tabIndex = current === 0 ? -1 : 0;
    next.setAttribute('aria-disabled', String(current === panels.length - 1)); next.tabIndex = current === panels.length - 1 ? -1 : 0;
    previous.href = '#year-' + Math.max(1, current); next.href = '#year-' + Math.min(panels.length, current + 2);
    report.querySelector('[data-year-page]').textContent = String(current + 1).padStart(2, '0') + ' / 07';
    count(panels[current]);
    if (changeHash) {
      history.replaceState(null, '', '#year-' + (current + 1));
      var heading = panels[current].querySelector('h1,h2'); heading.tabIndex = -1; heading.focus({ preventScroll: true });
      if (report.getBoundingClientRect().top < -80) report.scrollIntoView({ behavior: motion ? 'smooth' : 'auto', block: 'start' });
    }
  }
  function setMotion(active) {
    motion = active && !reduced.matches;
    report.classList.toggle('ya-no-motion', !motion);
    button.textContent = reduced.matches ? '已减少动效' : motion ? '关闭动效' : '开启动效'; button.disabled = reduced.matches; button.setAttribute('aria-pressed', String(!motion));
    if (!motion) { cancelCounters(); panels[current].querySelectorAll('[data-year-number]').forEach(function (n) { n.textContent = Number(n.dataset.yearNumber).toFixed(Number(n.dataset.yearDecimals)); }); }
  }
  button.addEventListener('click', function () { setMotion(!motion); });
  reduced.addEventListener('change', function () { setMotion(!reduced.matches); });
  report.addEventListener('click', function (event) {
    var link = event.target.closest('[data-year-target],[data-year-next],[data-year-previous]');
    if (!link) return;
    event.preventDefault();
    if (link.getAttribute('aria-disabled') === 'true') return;
    show(link.hasAttribute('data-year-target') ? Number(link.dataset.yearTarget) : current + (link.hasAttribute('data-year-next') ? 1 : -1), true);
  });
  document.addEventListener('keydown', function (event) {
    if (event.altKey || event.ctrlKey || event.metaKey || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || document.querySelector('dialog[open]')) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); show(current + (event.key === 'ArrowRight' ? 1 : -1), true); }
  });
  report.addEventListener('pointermove', function (event) {
    if (!motion || event.pointerType !== 'mouse') return;
    var rect = report.getBoundingClientRect();
    report.style.setProperty('--ya-parallax', ((event.clientX - rect.left) / rect.width * 8 - 4).toFixed(2) + 'deg');
  });
  window.addEventListener('hashchange', function () { var match = /^#year-([1-7])$/.exec(location.hash); if (match) show(Number(match[1]) - 1, false); });
  document.addEventListener('visibilitychange', function () { report.classList.toggle('ya-no-motion', document.hidden || !motion); });
  setMotion(motion);
  var initial = /^#year-([1-7])$/.exec(location.hash); show(initial ? Number(initial[1]) - 1 : 0, false);
})();
