(function () {
  'use strict';
  var key = 'kaeto-color-theme';
  var root = document.documentElement;
  var system = window.matchMedia('(prefers-color-scheme: dark)');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var mode = 'system';
  var timer;
  var labels = { light: '浅色', dark: '夜间', system: '跟随系统' };
  function valid(value) { return value === 'light' || value === 'dark' || value === 'system'; }
  try { var saved = localStorage.getItem(key); if (valid(saved)) mode = saved; } catch (_) { /* System preference still works in restricted storage. */ }

  function apply(animate) {
    var palette = mode === 'system' ? (system.matches ? 'dark' : 'light') : mode;
    if (animate && !reduced.matches && root.dataset.theme !== palette) {
      root.classList.add('theme-changing');
      clearTimeout(timer);
      timer = setTimeout(function () { root.classList.remove('theme-changing'); }, 220);
    }
    root.dataset.theme = palette;
    root.dataset.themeMode = mode;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = palette === 'dark' ? '#19151e' : '#fffafb';
    document.querySelectorAll('[data-theme-choice]').forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.themeChoice === mode));
    });
    document.querySelectorAll('.theme-picker summary').forEach(function (summary) {
      summary.title = '颜色主题：' + labels[mode];
      summary.setAttribute('aria-label', '颜色主题：' + labels[mode]);
    });
  }
  apply(false);
  function changed() { if (mode === 'system') apply(true); }
  if (system.addEventListener) system.addEventListener('change', changed);
  else system.addListener(changed);
  window.addEventListener('storage', function (event) {
    if (event.key !== key && event.key !== null) return;
    mode = valid(event.newValue) ? event.newValue : 'system';
    apply(true);
  });
  document.addEventListener('DOMContentLoaded', function () {
    apply(false);
    var picker = document.querySelector('.theme-picker');
    if (!picker) return;
    picker.querySelectorAll('[data-theme-choice]').forEach(function (button) {
      button.addEventListener('click', function () {
        mode = button.dataset.themeChoice;
        var stored = true;
        try { localStorage.setItem(key, mode); } catch (_) { stored = false; }
        apply(true);
        var feedback = picker.querySelector('.theme-feedback');
        feedback.textContent = stored ? '' : '当前主题已切换；浏览器禁止保存偏好，下次将跟随系统。';
        if (stored) { picker.open = false; picker.querySelector('summary').focus(); }
      });
    });
    document.addEventListener('click', function (event) { if (!picker.contains(event.target)) picker.open = false; });
    picker.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && picker.open) { picker.open = false; picker.querySelector('summary').focus(); }
    });
  });
}());
