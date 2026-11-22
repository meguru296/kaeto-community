(() => {
  const form = document.querySelector('[data-review-form]');
  if (!form) return;
  const textarea = form.elements.content;
  const composer = form.closest('.fr-composer');
  const count = form.querySelector('[data-review-count]');
  const feedback = form.querySelector('[data-review-feedback]');
  const preview = form.querySelector('[data-review-preview-body]');
  const editButton = form.querySelector('[data-review-edit]');
  const previewButton = form.querySelector('[data-review-preview]');
  const picker = form.querySelector('.fr-sticker-picker');
  const toggle = form.querySelector('[data-stickers-toggle]');
  const stickers = new Map([...form.querySelectorAll('[data-review-sticker]')].map(item => [item.dataset.reviewSticker, item.dataset.stickerUrl]));
  let selectionStart = textarea.selectionStart, selectionEnd = textarea.selectionEnd;
  let composing = false;
  function update() {
    count.textContent = `${textarea.value.length} / 2000`;
    count.classList.toggle('is-full', textarea.value.length >= 2000);
    textarea.setCustomValidity(textarea.value.length > 2000 ? '评价最多 2000 字，请缩短后再提交。' : '');
  }
  function rememberSelection() { selectionStart = textarea.selectionStart; selectionEnd = textarea.selectionEnd; }
  ['keyup', 'click', 'select', 'blur'].forEach(event => textarea.addEventListener(event, rememberSelection));
  textarea.addEventListener('input', () => { rememberSelection(); update(); feedback.textContent = ''; });
  textarea.addEventListener('compositionstart', () => { composing = true; });
  textarea.addEventListener('compositionend', () => { composing = false; update(); });
  function showEdit(focus = false) {
    textarea.hidden = false; preview.hidden = true;
    editButton.setAttribute('aria-pressed', 'true'); previewButton.setAttribute('aria-pressed', 'false');
    if (focus) textarea.focus({ preventScroll: true });
  }
  function showPreview() {
    preview.replaceChildren();
    const text = textarea.value;
    const pattern = /\[星标:[^\]\n]+\]/g;
    let start = 0;
    for (const match of text.matchAll(pattern)) {
      preview.append(document.createTextNode(text.slice(start, match.index)));
      if (stickers.has(match[0])) {
        const image = document.createElement('img'); image.className = 'review-sticker';
        image.dataset.stickerAnimation=stickers.get(match[0]); image.src = image.dataset.stickerAnimation.replace('/optimized/','/previews/'); image.alt = match[0]; image.width = image.height = 72;
        preview.append(image);
      } else preview.append(document.createTextNode(match[0]));
      start = match.index + match[0].length;
    }
    preview.append(document.createTextNode(text.slice(start) || (text ? '' : '写下感想后，可以在这里预览。')));
    textarea.hidden = true; preview.hidden = false;
    editButton.setAttribute('aria-pressed', 'false'); previewButton.setAttribute('aria-pressed', 'true');
  }
  editButton.addEventListener('click', () => showEdit(true));
  previewButton.addEventListener('click', showPreview);
  toggle.addEventListener('click', () => { picker.hidden = !picker.hidden; toggle.setAttribute('aria-expanded', String(!picker.hidden)); });
  picker.querySelectorAll('[data-review-sticker]').forEach(button => button.addEventListener('click', () => {
    const token = button.dataset.reviewSticker;
    if (textarea.value.length - (selectionEnd - selectionStart) + token.length > 2000) { feedback.textContent = '字数已满，删减一些文字后再插入表情。'; return; }
    showEdit(true);
    textarea.setRangeText(token, selectionStart, selectionEnd, 'end');
    rememberSelection(); update(); feedback.textContent = '';
  }));
  document.querySelectorAll('[data-review-jump]').forEach(link => link.addEventListener('click', event => {
    event.preventDefault(); showEdit();
    composer.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    textarea.focus({ preventScroll: true });
    history.replaceState(null, '', '#review-composer');
  }));
  textarea.addEventListener('keydown', event => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing && !composing) { event.preventDefault(); form.requestSubmit(); }
  });
  form.addEventListener('submit', event => { showEdit(); update(); if (!form.reportValidity()) event.preventDefault(); });
  // Required textareas must be visible when native form validation runs.
  form.querySelector('[type="submit"]').addEventListener('click', () => { showEdit(); update(); });
  update();
})();
