(() => {
  'use strict';
  const dialog = document.querySelector('.td-dialog');
  if (!dialog) return;
  const list = dialog.querySelector('[data-taste-list]');
  const comparison = dialog.querySelector('[data-taste-comparison]');
  const scroll = dialog.querySelector('.td-dialog-scroll');
  const feedback = dialog.querySelector('.td-dialog-feedback');
  let opener = null, controller = null, pendingLink = null, comparisonOpener = null, listScroll = 0;
  function cancelRequest() {
    controller?.abort(); controller = null;
    if (pendingLink) { pendingLink.removeAttribute('aria-busy'); pendingLink = null; }
    feedback.hidden = true; feedback.textContent = '';
  }
  function showList() {
    cancelRequest(); comparison.hidden = true; comparison.replaceChildren(); list.hidden = false;
    scroll.scrollTop = listScroll;
  }
  function open(button) {
    opener = button || document.querySelector('[data-taste-open]');
    listScroll = 0; showList();
    if (!dialog.open) dialog.showModal();
    document.documentElement.classList.add('td-modal-open');
  }
  document.querySelectorAll('[data-taste-open]').forEach(button => button.addEventListener('click', () => open(button)));
  dialog.querySelector('[data-taste-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('td-modal-open');
    showList(); opener?.focus({preventScroll:true});
  });
  dialog.addEventListener('click', async event => {
    if (event.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
      return;
    }
    if (event.target.closest('[data-taste-back]')) { showList(); (comparisonOpener || dialog.querySelector('[data-taste-compare]'))?.focus({preventScroll:true}); return; }
    const link = event.target.closest('[data-taste-compare]');
    // Preserve normal new-tab and keyboard-modified link behavior.
    if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const url = new URL(link.href,location.href);
    if (url.origin !== location.origin || !/^\/me\/similar\/[1-9]\d{0,14}$/.test(url.pathname)) return;
    event.preventDefault(); cancelRequest();
    const request = new AbortController(); controller = request; pendingLink = link; comparisonOpener = link;
    link.setAttribute('aria-busy','true'); feedback.hidden = false; feedback.textContent = '正在打开共同作品…';
    url.searchParams.set('fragment','1');
    try {
      const response = await fetch(url,{credentials:'same-origin',signal:request.signal,headers:{Accept:'text/html'}});
      if (response.redirected || !response.ok) throw Error('暂时无法比较，登录可能已过期或对方已退出推荐。请刷新后再试。');
      const html = await response.text();
      const fragment = new DOMParser().parseFromString(html,'text/html').querySelector('.td-comparison');
      if (!fragment || !fragment.querySelector('[data-taste-back]')) throw Error('共同作品暂时无法打开，请稍后再试。');
      if (controller !== request || !dialog.open) return;
      listScroll = scroll.scrollTop;
      comparison.replaceChildren(fragment); list.hidden = true; comparison.hidden = false;
      scroll.scrollTop = 0; fragment.querySelector('[data-taste-back]').focus({preventScroll:true});
      feedback.hidden = true;
    } catch (error) {
      if (error.name !== 'AbortError' && controller === request) feedback.textContent = error.message || '暂时无法打开，请稍后再试。';
    } finally {
      if (controller === request) { link.removeAttribute('aria-busy'); pendingLink = null; controller = null; }
    }
  });
  if (dialog.dataset.tasteAutoOpen === '1') open();
})();
