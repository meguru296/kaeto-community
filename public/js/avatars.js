(() => {
  const dialog = document.querySelector('.av-dialog');
  if (!dialog) return;
  const form = dialog.querySelector('form');
  function preview() {
    const selected = form.querySelector('input:checked');
    dialog.querySelector('[data-avatar-preview]').src = selected.dataset.avatarUrl;
    dialog.querySelector('[data-avatar-name]').textContent = selected.dataset.avatarLabel;
  }
  document.querySelectorAll('[data-avatar-open]').forEach(button => button.addEventListener('click', () => {
    form.reset(); preview(); dialog.showModal();
  }));
  dialog.querySelectorAll('[data-avatar-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
  form.addEventListener('change', preview);
  dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
})();
