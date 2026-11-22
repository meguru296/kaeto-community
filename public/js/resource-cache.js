(function () {
  'use strict';
  var root = document.documentElement;
  var standaloneQuery = window.matchMedia('(display-mode: standalone)');
  var installEvent = null, registration = null, applyingUpdate = false, updateTimer;
  var installButtons = Array.from(document.querySelectorAll('[data-pwa-install]'));
  var installStatus = document.querySelector('[data-pwa-install-status]');
  var updateNotice = document.querySelector('[data-pwa-update]');
  var updateText = document.querySelector('[data-pwa-update-text]');
  var updateButton = document.querySelector('[data-pwa-update-apply]');
  var connectionNotice = document.querySelector('[data-pwa-connection]');
  var connectionText = document.querySelector('[data-pwa-connection-text]');
  var connectionDismissed = false, sawOffline = navigator.onLine === false;
  var trackedEditors = new Map();

  function isStandalone() { return standaloneQuery.matches || navigator.standalone === true; }
  function updateDisplayMode() {
    var installed = isStandalone();
    root.toggleAttribute('data-pwa-standalone', installed);
    installButtons.forEach(function (button) { button.hidden = installed || !installEvent; });
    if (installed && installStatus) installStatus.textContent = '正在独立窗口中使用视觉小说社区，随时欢迎回来。';
    var back = document.querySelector('[data-pwa-back]');
    if (back) back.hidden = !installed || location.pathname === '/';
  }
  updateDisplayMode();
  if (standaloneQuery.addEventListener) standaloneQuery.addEventListener('change', updateDisplayMode);
  window.addEventListener('beforeinstallprompt', function (event) {
    // Only defer the browser prompt when this page offers its own install action.
    if (!installButtons.length || isStandalone()) return;
    event.preventDefault(); installEvent = event; updateDisplayMode();
    if (installStatus) installStatus.textContent = '你的浏览器支持安装，点击按钮即可添加视觉小说社区。';
  });
  installButtons.forEach(function (button) {
    button.addEventListener('click', async function () {
      var pending = installEvent;
      if (!pending) return;
      installEvent = null; button.disabled = true;
      try {
        await pending.prompt();
        var choice = await pending.userChoice;
        if (installStatus) installStatus.textContent = choice.outcome === 'accepted' ? '已确认安装，请按系统提示完成。' : '已取消安装。之后也可以从浏览器菜单添加。';
      } catch (_) {
        if (installStatus) installStatus.textContent = '请使用浏览器菜单中的安装选项，或参考下方说明。';
      } finally { button.disabled = false; updateDisplayMode(); }
    });
  });
  window.addEventListener('appinstalled', function () {
    installEvent = null; updateDisplayMode();
    if (installStatus) installStatus.textContent = '视觉小说社区已添加，可以从主屏幕或应用列表打开。';
  });
  var back = document.querySelector('[data-pwa-back]');
  if (back) back.addEventListener('click', function () {
    var internal = false;
    try { internal = new URL(document.referrer).origin === location.origin; } catch (_) { /* Direct launch. */ }
    if (internal && history.length > 1) history.back(); else location.assign('/');
  });
  document.addEventListener('click', function (event) {
    if (!isStandalone() || !(event.target instanceof Element)) return;
    var link = event.target.closest('a[href]');
    if (!link || link.hasAttribute('download')) return;
    try {
      var url = new URL(link.href);
      if (/^https?:$/.test(url.protocol) && url.origin !== location.origin) {
        link.target = '_blank'; link.relList.add('noopener', 'noreferrer');
      }
    } catch (_) { /* Let the browser handle non-URL links. */ }
  }, true);

  function connectionState() {
    if (!connectionNotice) return;
    var offline = navigator.onLine === false;
    if (offline) sawOffline = true;
    connectionNotice.hidden = connectionDismissed || (!offline && !sawOffline);
    connectionText.textContent = offline ? '当前处于离线状态。请保留正在编辑的内容，联网后再提交。' : '网络已连接。可以继续浏览，未提交的内容请确认后再保存。';
  }
  window.addEventListener('offline', function () { connectionDismissed = false; connectionState(); });
  window.addEventListener('online', function () { connectionDismissed = false; connectionState(); });
  var dismiss = document.querySelector('[data-pwa-connection-dismiss]');
  if (dismiss) dismiss.addEventListener('click', function () { connectionDismissed = true; connectionState(); });
  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (navigator.onLine !== false || !(form instanceof HTMLFormElement) || form.method.toLowerCase() !== 'post') return;
    event.preventDefault(); event.stopImmediatePropagation();
    connectionDismissed = false; connectionState();
  }, true);
  connectionState();

  // Capture values before editing. Never reload another tab on controllerchange.
  function editorValue(element) { return element.isContentEditable ? element.innerHTML : element.value; }
  document.addEventListener('focusin', function (event) {
    var element = event.target;
    if (!(element instanceof Element) || element.matches('[readonly],[disabled]')) return;
    if (element.matches('textarea,input[type="text"],input:not([type]),input[type="email"],input[type="password"],input[type="url"],input[type="file"],[contenteditable="true"]') && !trackedEditors.has(element)) trackedEditors.set(element, editorValue(element));
  });
  function mayReload() {
    var dirty = Array.from(trackedEditors).some(function (entry) { return entry[0].isConnected && editorValue(entry[0]) !== entry[1]; });
    var playing = Array.from(document.querySelectorAll('audio,video')).some(function (media) { return !media.paused && !media.ended; });
    return !(dirty || playing) || window.confirm(dirty ? '你可能还有尚未保存的内容。请先保存；现在仍要更新并重新打开吗？' : '更新会中断当前播放。现在重新打开视觉小说社区吗？');
  }
  function showUpdate(alreadyActive) {
    if (!updateNotice || applyingUpdate) return;
    updateNotice.hidden = false;
    updateText.textContent = alreadyActive ? '其他窗口已更新。保存好当前内容后，重新打开即可使用新版。' : '保存好正在编辑的内容后，再更新。';
    updateButton.textContent = alreadyActive ? '重新打开新版' : '更新并重新打开';
    updateButton.disabled = false;
  }
  var later = document.querySelector('[data-pwa-update-later]');
  if (later) later.addEventListener('click', function () { updateNotice.hidden = true; });
  if (updateButton) updateButton.addEventListener('click', function () {
    if (!mayReload()) return;
    if (!registration || !registration.waiting) { location.reload(); return; }
    applyingUpdate = true; updateButton.disabled = true;
    updateText.textContent = '正在准备新版，请稍等…';
    // A closed tab never forces other tabs to reload or discard their work.
    registration.waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
    updateTimer = setTimeout(function () {
      applyingUpdate = false; updateButton.disabled = false;
      updateText.textContent = '更新尚未完成，请稍后重试。当前内容仍然保留。';
    }, 15000);
  });

  if (!window.isSecureContext || !('serviceWorker' in navigator)) return;
  var hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (applyingUpdate) { clearTimeout(updateTimer); location.reload(); return; }
    if (hadController) showUpdate(true);
    hadController = true;
  });
  function watchRegistration(value) {
    registration = value;
    if (value.waiting && navigator.serviceWorker.controller) showUpdate(false);
    value.addEventListener('updatefound', function () {
      var installing = value.installing;
      if (installing) installing.addEventListener('statechange', function () {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) showUpdate(false);
      });
    });
  }
  function start() {
    navigator.serviceWorker.register('/resource-cache.js', { scope: '/', updateViaCache: 'none' })
      .then(function (value) { watchRegistration(value); return navigator.serviceWorker.ready; })
      .then(function (value) {
        root.dataset.resourceCache = 'ready';
        var urls = Array.from(document.querySelectorAll('link[rel="stylesheet"],script[src]')).map(function (element) { return element.href || element.src; });
        Array.from(document.images).forEach(function (image) { if (image.complete && image.naturalWidth) urls.push(image.currentSrc || image.src); });
        if (value.active) value.active.postMessage({ type: 'WARM_PUBLIC_ASSETS', urls: urls });
      }).catch(function () { /* Normal navigation still works if installation/storage is unavailable. */ });
  }
  var lastCheck = Date.now();
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible' || !registration || navigator.onLine === false) return;
    if (registration.waiting) showUpdate(false);
    if (Date.now() - lastCheck < 15 * 60 * 1000) return;
    lastCheck = Date.now(); registration.update().catch(function () {});
  });
  function idle() { if ('requestIdleCallback' in window) window.requestIdleCallback(start, { timeout: 1500 }); else setTimeout(start, 0); }
  if (document.readyState === 'complete') idle(); else window.addEventListener('load', idle, { once: true });
})();
