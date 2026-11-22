/* 月读评分 · 前端交互（原生 JS，无依赖） */
(function () {
  'use strict';

  var doc = document;

  /* ---------------- 评分控件：点数字打分 ---------------- */
  doc.querySelectorAll('[data-rate-widget]').forEach(function (widget) {
    var stars = Array.prototype.slice.call(widget.querySelectorAll('.star'));
    var input = widget.querySelector('[data-rate-input]');
    var label = widget.querySelector('[data-rate-label]');
    var bands = [
      [10, '超神作'],
      [9, '神作'],
      [8, '很棒'],
      [7, '不错'],
      [6, '还行'],
      [5, '一般'],
      [4, '略差'],
      [3, '较差'],
      [2, '差'],
      [1, '很差'],
    ];

    function bandOf(n) {
      for (var i = 0; i < bands.length; i += 1) {
        if (n >= bands[i][0]) return bands[i][1];
      }
      return '';
    }

    function paint(value) {
      stars.forEach(function (s) {
        var n = Number(s.dataset.value);
        s.classList.toggle('on', value > 0 && n <= value);
      });
      if (label) label.textContent = value > 0 ? value + ' 分 · ' + bandOf(value) : '点数字打分（1-10）';
    }

    stars.forEach(function (star) {
      var n = Number(star.dataset.value);
      star.addEventListener('mouseenter', function () {
        stars.forEach(function (s) {
          s.classList.toggle('hover', Number(s.dataset.value) <= n);
        });
      });
      star.addEventListener('click', function () {
        if (input) input.value = String(n);
        paint(n);
      });
    });

    widget.addEventListener('mouseleave', function () {
      stars.forEach(function (s) {
        s.classList.remove('hover');
      });
    });

    paint(input && input.value ? Number(input.value) : 0);
  });

  /* ---------------- 危险操作二次确认 ---------------- */
  doc.addEventListener(
    'click',
    function (event) {
      var el = event.target.closest('[data-confirm]');
      if (!el) return;
      if (!window.confirm(el.dataset.confirm || '确认执行该操作？')) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    true,
  );

  /* ---------------- 表单防重复提交 ---------------- */
  doc.querySelectorAll('form').forEach(function (form) {
    form.addEventListener('submit', function (event) {
      var btn = form.querySelector('button[type="submit"]:not([formaction])');
      if (btn && !btn.dataset.noLock) {
        setTimeout(function () {
          if (event.defaultPrevented) return;
          btn.disabled = true;
          btn.dataset.originalText = btn.textContent;
          btn.textContent = '处理中…';
        }, 0);
        setTimeout(function () {
          btn.disabled = false;
          if (btn.dataset.originalText) btn.textContent = btn.dataset.originalText;
        }, 8000);
      }
    });
  });

  /* ---------------- 提示条自动淡出 ---------------- */
  var flash = doc.querySelector('.flash');
  if (flash) {
    setTimeout(function () {
      flash.classList.add('flash-fade');
    }, 4200);
  }

  /* ---------------- 图片兜底 ---------------- */
  doc.addEventListener(
    'error',
    function (event) {
      var el = event.target;
      if (el && el.tagName === 'IMG' && !el.dataset.failed) {
        el.dataset.failed = '1';
        el.classList.add('img-failed');
        var box = el.closest('.cover-box');
        if (box) box.classList.add('cover-fallback');
      }
    },
    true,
  );

  /* ---------------- 键盘快捷键：/ 聚焦搜索 ---------------- */
  doc.addEventListener('keydown', function (event) {
    if (event.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(doc.activeElement.tagName)) {
      var input = doc.querySelector('input[type="search"]');
      if (input) {
        event.preventDefault();
        input.focus();
        input.select();
      }
    }
  });
})();
