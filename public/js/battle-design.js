(function () {
  'use strict';
  document.querySelectorAll('[data-character-image]').forEach(function (image) {
    image.addEventListener('error', function () {
      var placeholder = document.createElement('span'); placeholder.className = 'mb-image-empty';
      placeholder.textContent = '图片暂不可用'; placeholder.style.fontSize = '12px'; image.replaceWith(placeholder);
    });
  });
  document.querySelectorAll('[data-match-deadline]').forEach(function (card) {
    function lock() {
      if (Date.now() < Date.parse(card.dataset.matchDeadline)) return;
      card.querySelectorAll('.mb-vote-button').forEach(function (button) {
        if (button.tagName === 'BUTTON') button.disabled = true;
        else { button.removeAttribute('href'); button.setAttribute('aria-disabled','true'); }
        button.textContent = '本场已截止';
      });
      var status = card.querySelector('.mb-status'); status.className = 'mb-status closed'; status.textContent = '已截止 · 等待结算';
    }
    lock(); setInterval(lock,1000);
  });
  document.querySelectorAll('[data-battle-deadline]').forEach(function (element) {
    var deadline = Date.parse(element.dataset.battleDeadline);
    function update() {
      var seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      if (!seconds) {
        element.textContent = '已截止，刷新查看结果';
        return;
      }
      var days = Math.floor(seconds / 86400), hours = Math.floor(seconds % 86400 / 3600), minutes = Math.floor(seconds % 3600 / 60);
      element.textContent = '距离截止 ' + (days ? days + ' 天 ' : '') + hours + ' 时 ' + minutes + ' 分 ' + seconds % 60 + ' 秒';
    }
    update(); setInterval(update, 1000);
  });
  document.querySelectorAll('[data-cheer-form]').forEach(function (form) {
    var textarea = form.elements.content, toggle = form.querySelector('[data-cheer-toggle]'), picker = form.querySelector('.mb-stickers');
    function update() { form.querySelector('[data-cheer-count]').textContent = textarea.value.length + ' / 500 字'; }
    textarea.addEventListener('input', update); update();
    toggle.addEventListener('click', function () { picker.hidden = !picker.hidden; toggle.setAttribute('aria-expanded', String(!picker.hidden)); });
    picker.querySelectorAll('[data-cheer-sticker]').forEach(function (button) {
      button.addEventListener('click', function () {
        var token = button.dataset.cheerSticker, start = textarea.selectionStart, end = textarea.selectionEnd;
        if (textarea.value.length - (end - start) + token.length > 500) { textarea.setCustomValidity('加入这个表情会超过 500 字，请先删减文字。'); textarea.reportValidity(); return; }
        textarea.setCustomValidity(''); textarea.setRangeText(token, start, end, 'end'); textarea.focus(); update();
      });
    });
    textarea.addEventListener('input', function () { textarea.setCustomValidity(''); });
  });
  document.querySelectorAll('[data-battle-image-input]').forEach(function (input) {
    function updatePreview() {
      var box = input.closest('details').querySelector('.mb-admin-preview');
      var old = box.querySelector('img,.mb-image-empty');
      var value = input.value.trim();
      if (!value || !(value.startsWith('https://') || value.startsWith('/img/'))) {
        var empty = document.createElement('span'); empty.className = 'mb-image-empty';
        empty.textContent = value ? '请使用 HTTPS 图片地址或本站路径' : '图片待补充'; old.replaceWith(empty); return;
      }
      var image = document.createElement('img'); image.alt = '角色图片预览'; image.referrerPolicy = 'no-referrer'; image.src = value;
      image.addEventListener('error', function () { var missing = document.createElement('span'); missing.className = 'mb-image-empty'; missing.textContent = '图片暂不可用'; image.replaceWith(missing); });
      old.replaceWith(image);
    }
    input.addEventListener('input', updatePreview);
    input.addEventListener('change', updatePreview);
  });
  var pendingUploads = 0, adminForm = document.querySelector('.mb-admin-form');
  function updateSaveButton() {
    if (!adminForm) return;
    var button = adminForm.querySelector('.mb-admin-save button');
    button.disabled = pendingUploads > 0;
    button.textContent = pendingUploads ? '图片上传中，请稍候…' : '保存活动设置 →';
  }
  document.querySelectorAll('[data-battle-upload-file]').forEach(function (fileInput) {
    var box = fileInput.closest('.mb-image-upload');
    var button = box.querySelector('[data-battle-upload-button]');
    var status = box.querySelector('[data-battle-upload-status]');
    var imageInput = box.closest('details').querySelector('[data-battle-image-input]');
    button.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', async function () {
      var file = fileInput.files[0];
      if (!file) return;
      if (!file.size || file.size > 5 * 1024 * 1024) {
        status.textContent = '图片大小需为 1B—5MB，请重新选择。'; fileInput.value = ''; return;
      }
      pendingUploads++; button.disabled = true; fileInput.disabled = true; updateSaveButton();
      status.textContent = '正在上传 ' + file.name + '…';
      try {
        var body = new FormData(); body.append('image', file);
        var response = await fetch('/api/battle/image', { method: 'POST', body: body, credentials: 'same-origin' });
        var result = await response.json();
        if (!response.ok) throw new Error(result.error || '上传失败，请稍后重试。');
        if (typeof result.image !== 'string' || !/^\/img\/uploads\/[a-f0-9]{32}\.(png|jpg|webp|gif)$/.test(result.image)) throw new Error('上传结果不正确，请稍后重试。');
        imageInput.value = result.image;
        imageInput.dispatchEvent(new Event('change', { bubbles: true }));
        status.textContent = '已上传 ' + file.name + '，预览已更新。点击“保存活动设置”后应用到角色。';
      } catch (err) { status.textContent = err.message || '网络异常，上传失败，请重试。'; }
      finally {
        pendingUploads--; button.disabled = false; fileInput.disabled = false; fileInput.value = ''; updateSaveButton();
      }
    });
  });
  if (adminForm) adminForm.addEventListener('submit', function (event) {
    if (pendingUploads) event.preventDefault();
  });
  document.querySelectorAll('[data-settle-form]').forEach(function (form) {
    form.addEventListener('submit', function (event) { if (!window.confirm('确认本轮晋级结果？确认后结果锁定，胜者进入下一轮。')) event.preventDefault(); });
  });
})();

(function () {
  var dialog = document.querySelector('.mb-arrival');
  if (!dialog) return;
  var timer, previous;
  function close() { clearTimeout(timer); if (dialog.open) dialog.close(); if (previous) previous.focus({preventScroll:true}); }
  function play(manual) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || dialog.open) return;
    previous = manual ? document.activeElement : null; dialog.showModal(); timer = setTimeout(close, 1350);
  }
  dialog.querySelector('[data-skip-battle-opening]').addEventListener('click', close);
  dialog.addEventListener('cancel', function (event) { event.preventDefault(); close(); });
  document.querySelector('[data-replay-battle-opening]').addEventListener('click', function () { play(true); });
  try { if (!sessionStorage.getItem('battle-arena-opening-v1')) { sessionStorage.setItem('battle-arena-opening-v1','1'); play(false); } } catch (_) {}
})();
