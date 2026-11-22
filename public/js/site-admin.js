(function () {
  'use strict';
  var toggle = document.querySelector('[data-toggle-site-edit]'), dialog = document.querySelector('.site-edit-dialog');
  if (toggle && dialog) {
    toggle.addEventListener('click', function () {
      var active = !document.body.classList.contains('site-editing');
      document.body.classList.toggle('site-editing', active); toggle.setAttribute('aria-pressed', String(active)); toggle.textContent = active ? '退出页面编辑' : '开启页面编辑';
    });
    document.addEventListener('click', function (event) {
      var item = event.target.closest('[data-site-text],[data-site-image]');
      if (!item || !document.body.classList.contains('site-editing')) return;
      event.preventDefault(); event.stopPropagation();
      var form = dialog.querySelector('form');
      form.elements.key.value = item.dataset.siteText || item.dataset.siteImage;
      form.elements.redirect.value = location.pathname + location.search + location.hash;
      form.elements.value.value = item.dataset.siteText ? item.textContent.trim() : item.getAttribute('src');
      dialog.querySelector('[data-edit-label]').textContent = item.dataset.siteText ? '编辑文案' : '替换图片 · 填写素材路径';
      dialog.showModal(); form.elements.value.focus();
    }, true);
    dialog.querySelector('[data-close-site-edit]').addEventListener('click', function () { dialog.close(); });
  }
  document.querySelectorAll('[data-copy-asset]').forEach(function (button) { button.addEventListener('click', async function () { try { await navigator.clipboard.writeText(button.dataset.copyAsset); button.textContent = '已复制'; } catch (_) { button.textContent = '请选中路径复制'; } }); });
  function updateSourcePicker(picker) {
    var custom = picker.querySelector('select').value === '__custom__';
    var field = picker.querySelector('[data-source-custom]'), input = field.querySelector('input');
    field.hidden = !custom; input.disabled = !custom; input.required = custom;
  }
  document.querySelectorAll('[data-source-picker]').forEach(function (picker) {
    updateSourcePicker(picker);
    picker.querySelector('select').addEventListener('change', function () {
      updateSourcePicker(picker);
      if (!picker.querySelector('[data-source-custom]').hidden) picker.querySelector('input').focus();
    });
  });
  var sourceDialog = document.querySelector('.sa-source-dialog'), sourceOpener;
  if (sourceDialog) {
    document.querySelectorAll('[data-member-source]').forEach(function (button) {
      button.addEventListener('click', function () {
        sourceOpener = button;
        var form = sourceDialog.querySelector('form'), source = button.dataset.source;
        var select = form.elements.memberSource;
        var preset = Array.from(select.options).some(function (option) { return option.value === source && option.value !== '__custom__'; });
        form.elements.id.value = button.dataset.memberSource;
        select.value = preset ? source : '__custom__';
        form.elements.customMemberSource.value = preset ? '' : source;
        sourceDialog.querySelector('[data-source-member]').textContent = button.dataset.memberName;
        updateSourcePicker(form.querySelector('[data-source-picker]'));
        sourceDialog.showModal(); select.focus();
      });
    });
    sourceDialog.querySelectorAll('[data-source-close]').forEach(function (button) { button.addEventListener('click', function () { sourceDialog.close(); }); });
    sourceDialog.addEventListener('close', function () { if (sourceOpener) sourceOpener.focus(); });
  }
})();
