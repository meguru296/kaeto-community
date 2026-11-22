(function () {
  'use strict';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var savingStamp = false;
  document.addEventListener('submit', async function (event) {
    var form = event.target.closest('[data-collection-stamp]');
    if (!form) return;
    event.preventDefault();
    if (savingStamp) return;
    savingStamp = true;
    var feedback = document.querySelector('.mc-feedback');
    var card = form.closest('.mr-work');
    var button = form.querySelector('button');
    var label = button.textContent;
    var gid = form.elements.gid.value;
    button.disabled = true;
    button.textContent = '保存中…';
    card.setAttribute('aria-busy','true');
    feedback.classList.remove('is-success');
    feedback.textContent = '正在给故事留下一枚印章…';
    try {
      var response = await fetch(form.action,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},body:new URLSearchParams(new FormData(form))});
      if (response.redirected) throw new Error('登录已过期，请重新登录后再试。');
      var data = await response.json();
      if (!response.ok) throw new Error(data.error || '保存未完成，请稍后再试。');
      if (!reduced.matches) {
        card.classList.add('mc-stamping');
        var stamp = document.createElement('span');
        stamp.className = 'mc-stamp-pop'; stamp.textContent = '✓'; stamp.setAttribute('aria-hidden','true'); card.appendChild(stamp);
        await new Promise(function(resolve){setTimeout(resolve,360);});
      }
      document.querySelector('[data-collection-shelf]').innerHTML = data.recordsHtml;
      var organized = !!document.querySelector('.mp-workspace');
      document.querySelector('.mc-dashboard').outerHTML = organized && data.progressHtml ? data.progressHtml : data.dashboardHtml;
      if(organized && data.badgesHtml) document.querySelector('.mc-badge-book').outerHTML = data.badgesHtml;
      document.querySelector('.mc-next-step').outerHTML = data.nudgeHtml;
      if(data.levelHtml) document.querySelector('.ml-panel').outerHTML=data.levelHtml;
      if(data.annualBadgeHtml) document.querySelector('.ml-annual-badge').outerHTML=data.annualBadgeHtml;
      if(data.levelBadgeHtml) document.querySelectorAll('.nav-user .ml-level,.mr-member h1 .ml-level').forEach(function(el){el.outerHTML=data.levelBadgeHtml;});
      document.querySelectorAll('.mr-stats a').forEach(function(link){var key=new URL(link.href).searchParams.get('filter');if (Object.hasOwn(data.counts,key)) link.querySelector('strong').textContent=data.counts[key];});
      feedback.classList.add('is-success'); feedback.textContent = data.message;
      var replacement = document.querySelector('.mr-work[data-gid="'+gid+'"]');
      if (replacement) {
        if (!reduced.matches) replacement.animate([{transform:'scale(.96)'},{transform:'scale(1)'}],{duration:260});
        (replacement.querySelector('[data-collection-stamp] button') || replacement.querySelector('.mc-review-link') || replacement.querySelector('a')).focus({preventScroll:true});
      } else { feedback.tabIndex=-1; feedback.focus({preventScroll:true}); }
      var currentUrl = new URL(location.href);
      if (currentUrl.searchParams.has('page')) { currentUrl.searchParams.set('page',data.page); history.replaceState(null,'',currentUrl); }
    } catch (error) {
      feedback.textContent = error instanceof SyntaxError || error instanceof TypeError ? '未能确认保存结果，请刷新查看记录后再试。' : error.message;
      button.disabled = false; button.textContent = label;
      card.removeAttribute('aria-busy');
      card.classList.remove('mc-stamping');
      var failedStamp = card.querySelector('.mc-stamp-pop');
      if (failedStamp) failedStamp.remove();
    } finally { savingStamp = false; }
  });
  var bioDialog = document.querySelector('.mr-bio-dialog');
  if (bioDialog) {
    document.querySelectorAll('[data-bio-open]').forEach(function (button) {
      button.addEventListener('click', function () {
        bioDialog.querySelector('form').reset();
        bioDialog.showModal();
      });
    });
    bioDialog.querySelectorAll('[data-bio-close]').forEach(function (button) {
      button.addEventListener('click', function () { bioDialog.close(); });
    });
    bioDialog.addEventListener('click', function (event) {
      if (event.target !== bioDialog) return;
      var rect = bioDialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) bioDialog.close();
    });
  }
  // Native document transitions cover navigation without intercepting forms,
  // history or opening links in a new tab.
  document.querySelectorAll('[data-clear-score]').forEach(function (button) {
    button.addEventListener('click', function () {
      var widget = button.closest('form').querySelector('[data-rate-widget]');
      widget.querySelector('[data-rate-input]').value = '';
      widget.querySelectorAll('.star').forEach(function (star) { star.classList.remove('on', 'hover'); });
      widget.querySelector('[data-rate-label]').textContent = '未评分';
    });
  });
  document.querySelectorAll('.mr-record-form').forEach(function (form) {
    form.addEventListener('submit', function (event) {
      var status = form.elements.status;
      var note = form.elements.note;
      note.setCustomValidity('');
      if (note.value.trim() && !status.value) {
        event.preventDefault();
        note.setCustomValidity('填写章节 / 路线进度时，请选择一个游玩状态。');
        note.reportValidity();
      }
    });
    form.elements.status.addEventListener('change', function () { form.elements.note.setCustomValidity(''); });
    form.elements.note.addEventListener('input', function () { form.elements.note.setCustomValidity(''); });
  });
  document.querySelectorAll('[data-copy-value]').forEach(function (button) {
    button.addEventListener('click', async function () {
      var feedback = document.querySelector('.mr-copy-feedback');
      try {
        var text = button.dataset.copyValue;
        if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
        else {
          var input = document.createElement('textarea'); input.value = text;
          input.style.cssText = 'position:fixed;left:-9999px'; document.body.appendChild(input);
          input.select(); var copied = document.execCommand('copy'); input.remove();
          if (!copied) throw new Error('copy');
        }
        if (feedback) feedback.textContent = '已复制';
      } catch (_) { if (feedback) feedback.textContent = '复制未完成，请选中文字手动复制。'; }
      if (feedback) setTimeout(function () { feedback.textContent = ''; }, 2500);
    });
  });
  var cards = document.body.dataset.authenticated === '1' ? Array.from(document.querySelectorAll('.game-card[data-media-gid]')).filter(function (card) { return card.dataset.mediaGid; }) : [];
  var cursor = 0;
  async function hydrate() {
    while (cursor < cards.length) {
      var card = cards[cursor++];
      try {
        var response = await fetch('/api/work-media?gid=' + encodeURIComponent(card.dataset.mediaGid));
        if (!response.ok) continue;
        var data = await response.json();
        if (data.cover) {
          var image = card.querySelector('img.cover');
          if (!image) {
            image = document.createElement('img'); image.className = 'cover';
            image.alt = card.querySelector('.card-title').textContent; image.loading = 'lazy';
            card.querySelector('.cover-empty')?.replaceWith(image);
          }
          image.src = data.cover;
          if (!reduced.matches) image.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250 });
        } else {
          var placeholder = card.querySelector('.cover-empty');
          if (placeholder) placeholder.textContent = '暂无封面';
        }
        if (data.brand) card.querySelector('[data-work-brand]').textContent = data.brand;
      } catch (_) { /* The card remains usable when the data service is offline. */ }
    }
  }
  for (var i = 0; i < Math.min(3, cards.length); i += 1) hydrate();
})();

(() => {
  document.querySelectorAll('[data-share-profile]').forEach(button => button.addEventListener('click', async () => {
    const feedback = button.parentElement.querySelector('.mr-share-feedback');
    const address = new URL(button.dataset.shareProfile, location.origin).href;
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(address);
      else { const field = document.createElement('textarea'); field.value = address; field.style.cssText = 'position:fixed;left:-9999px'; document.body.appendChild(field); field.select(); const copied = document.execCommand('copy'); field.remove(); if (!copied) throw Error('Copy unavailable'); }
      feedback.textContent = '公开主页链接已复制';
    } catch { feedback.textContent = address; }
  }));
})();
