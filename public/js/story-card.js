(() => {
  'use strict';
  const studio = document.querySelector('[data-story-studio]');
  if (!studio) return;
  const find = selector => studio.querySelector(selector);
  const data = JSON.parse(find('[data-story-data]').textContent);
  const draft = data.draft;
  const form = find('[data-story-controls]');
  const canvas = find('[data-story-canvas]');
  const context = canvas.getContext('2d');
  const download = find('[data-story-download]');
  const feedback = find('[data-story-feedback]');
  const retry = find('[data-story-retry]');
  const exportPanel = find('[data-story-export]');
  const exportLink = find('[data-story-export-link]');
  const saveStatus = find('[data-story-save-status]');
  const saveButton = find('[data-story-save]');
  const imageCache = new Map();
  const measure = value => Array.from(value).length;
  const normalized = value => value.normalize('NFKC').toLowerCase();
  const workLabels = Object.fromEntries(data.slots);
  let dirty = false;
  let editRevision = 0;
  let drawingRevision = 0;
  let exportUrl;
  let loading = 0;
  const waitingImages = [];
  const serif = '"Kaeto List Song"';
  const families = {
    sans: '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif',
    serif: serif + ', "Songti SC", SimSun, serif',
  };
  const scales = { compact: .9, standard: 1, large: 1.13 };
  const weightOffsets = { light: -75, regular: 0, bold: 100 };
  const font = (size, weight = 400) => {
    const { font: family, size: scale, weight: emphasis } = draft.appearance;
    const adjustedWeight = Math.max(family === 'serif' ? 400 : 300, Math.min(700, weight + weightOffsets[emphasis]));
    return adjustedWeight + ' ' + Math.round(size * scales[scale]) + 'px ' + families[family];
  };

  const channels = color => color.slice(1).match(/../g).map(value => parseInt(value, 16));
  function luminance(color) {
    const linear = channels(color).map(value => {
      const n = value / 255;
      return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4;
    });
    return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
  }
  function contrast(a, b) {
    const left = luminance(a), right = luminance(b);
    return (Math.max(left, right) + .05) / (Math.min(left, right) + .05);
  }
  function readableOn(color) {
    if (contrast(color, '#202e29') >= 4.5) return '#202e29';
    return contrast(color, '#ffffff') >= 4.5 ? '#ffffff' : '#000000';
  }
  function mix(from, to, amount) {
    const target = channels(to);
    return '#' + channels(from).map((value, i) => Math.round(value + (target[i] - value) * amount).toString(16).padStart(2, '0')).join('');
  }
  function colors() {
    const appearance = draft.appearance;
    const { background: paper, accent } = data.palettes[appearance.palette] || appearance;
    const ink = readableOn(paper);
    const tint = contrast(paper, accent) >= 1.8 ? accent : mix(accent, ink, .6);
    const muted = mix(ink, paper, .25);
    const highlight = contrast(paper, tint) >= 4.5 ? tint : ink;
    return {
      paper, ink, muted, tint, highlight, onTint: readableOn(tint),
      line: mix(paper, ink, .25),
      mat: mix(paper, tint, .1),
    };
  }

  async function request(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { Accept: 'application/json', ...options.headers } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '暂时无法连接，请重试');
    return result;
  }

  function button(label, action, className = 'story-small-button') {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = className;
    element.textContent = label;
    element.addEventListener('click', action);
    return element;
  }

  function fillTextFieldState() {
    const year = Number(form.elements.startYear.value);
    draft.name = form.elements.name.value.trim();
    draft.startYear = Number.isInteger(year) && year >= 1980 && year <= data.currentYear ? year : null;
    const note = Array.from(form.elements.note.value).slice(0, 50).join('');
    if (note !== form.elements.note.value) form.elements.note.value = note;
    draft.note = note.trim();
    find('[data-story-years]').textContent = draft.startYear ? '距今 ' + (data.currentYear - year) + ' 年' : '';
    find('[data-story-note-count]').textContent = measure(note) + ' / 50';
  }
  function fillSocialState(input) {
    const value = input.value.trim().replace(/^[@＠]+\s*/, '');
    const account = Array.from(value).slice(0, 48).join('');
    if (value !== account) input.value = account;
    const id = input.dataset.storySocial;
    if ((draft.socials[id] || '') === account) return false;
    if (account) draft.socials[id] = account;
    else delete draft.socials[id];
    return true;
  }

  function updateCard() {
    dirty = true;
    editRevision++;
    saveStatus.textContent = '有未保存的修改。';
    render();
  }

  const tabs = [...studio.querySelectorAll('[data-story-tab]')];
  function activateTab(tab, focus = false) {
    for (const item of tabs) {
      item.setAttribute('aria-selected', String(item === tab));
      item.tabIndex = item === tab ? 0 : -1;
      document.getElementById(item.getAttribute('aria-controls')).hidden = item !== tab;
    }
    if (focus) tab.focus();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activateTab(tab));
    tab.addEventListener('keydown', event => {
      const target = { ArrowLeft: (index + tabs.length - 1) % tabs.length, ArrowRight: (index + 1) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
      if (target === undefined) return;
      event.preventDefault();
      activateTab(tabs[target], true);
    });
  });

  for (const input of [form.elements.name, form.elements.startYear, form.elements.note]) {
    const change = event => {
      if (event.isComposing) return;
      if (input === form.elements.name) input.value = Array.from(input.value).slice(0, 32).join('');
      input.setCustomValidity('');
      fillTextFieldState();
      updateCard();
    };
    input.addEventListener('input', change);
    input.addEventListener('compositionend', change);
  }
  for (const input of studio.querySelectorAll('[data-story-social]')) {
    const change = event => {
      if (event.isComposing) return;
      if (fillSocialState(input)) updateCard();
    };
    input.addEventListener('input', change);
    input.addEventListener('compositionend', change);
  }
  const looks = ['palette', 'background', 'accent', 'font', 'weight', 'size'];
  find('#story-panel-appearance').addEventListener('input', event => {
    const field = event.target.name;
    if (!looks.includes(field)) return;
    const value = event.target.value;
    draft.appearance[field] = value;
    if (field === 'palette' && data.palettes[value]) {
      for (const color of ['background', 'accent']) {
        form.elements[color].value = draft.appearance[color] = data.palettes[value][color];
      }
    }
    find('[data-story-custom-colors]').hidden = draft.appearance.palette !== 'custom';
    updateCard();
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (saveButton.disabled) return;
    if (!draft.name || !form.elements.startYear.validity.valid ||
        (form.elements.startYear.value !== '' && !draft.startYear)) {
      activateTab(tabs[0]);
      const field = draft.name ? form.elements.startYear : form.elements.name;
      field.setCustomValidity(draft.name ? '请选择有效的入坑年份' : '请输入姓名（ID / CN）');
      field.reportValidity();
      return;
    }
    const pendingPreference = [...studio.querySelectorAll('[data-story-preference-input]')].find(input => input.value.trim());
    if (pendingPreference) {
      activateTab(tabs[3]);
      pendingPreference.focus();
      saveStatus.textContent = '请先添加正在输入的偏好，或清空输入框。';
      return;
    }
    const sentRevision = editRevision;
    saveButton.disabled = true;
    saveStatus.textContent = '正在保存…';
    try {
      const result = await request('/api/me/story-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revision: data.revision,
          name: draft.name,
          note: draft.note,
          startYear: draft.startYear,
          socials: draft.socials,
          appearance: draft.appearance,
          preferences: draft.preferences,
          works: Object.fromEntries(Object.entries(draft.works).map(([slot, work]) => [slot, work.gid])),
          characters: draft.characters.map(character => character.id),
        }),
      });
      data.revision = result.revision;
      if (sentRevision === editRevision) {
        Object.assign(draft, result.draft);
        dirty = false;
        drawWorkSelection();
        drawCharacterSelection();
        drawCharacterResults();
        drawPreferences();
        render();
      }
      saveStatus.textContent = dirty ? '上一次编辑已保存，还有新修改。' : '已保存到账户。';
    } catch (error) {
      saveStatus.textContent = error.message || '保存失败，当前内容仍在本页。';
    } finally {
      saveButton.disabled = false;
    }
  });
  // Validate hidden fields in the submit handler so the browser can focus them.
  form.noValidate = true;
  window.addEventListener('beforeunload', event => {
    if (!dirty && ![...studio.querySelectorAll('[data-story-preference-input]')].some(input => input.value.trim())) return;
    event.preventDefault();
    event.returnValue = '';
  });

  const dialog = find('[data-story-work-dialog]');
  const workQuery = find('#story-work-query');
  const workStatus = find('[data-story-work-status]');
  const workResults = find('[data-story-work-results]');
  let workController;
  let activeSlot;
  function drawWorkSelection() {
    for (const row of studio.querySelectorAll('[data-story-slot]')) {
      const work = draft.works[row.dataset.storySlot];
      row.querySelector('[data-story-work-name]').textContent = work?.title || '未选择';
      row.querySelector('[data-story-clear-work]').hidden = !work;
      const select = row.querySelector('[data-story-pick-work]');
      select.textContent = work ? '更换' : '选择';
      select.setAttribute('aria-label', select.textContent + workLabels[row.dataset.storySlot]);
    }
  }
  find('[data-story-slots]').addEventListener('click', event => {
    const clear = event.target.closest('[data-story-clear-work]');
    if (clear) {
      delete draft.works[clear.dataset.storyClearWork];
      drawWorkSelection();
      clear.nextElementSibling.focus();
      updateCard();
      return;
    }
    const pick = event.target.closest('[data-story-pick-work]');
    if (!pick) return;
    activeSlot = pick.dataset.storyPickWork;
    find('#story-work-dialog-title').textContent = '选择' + workLabels[activeSlot];
    workQuery.value = '';
    workResults.replaceChildren();
    workStatus.textContent = '';
    dialog.showModal();
    workQuery.focus();
  });
  find('[data-story-close-dialog]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => workController?.abort());
  find('[data-story-work-search]').addEventListener('submit', async event => {
    event.preventDefault();
    const query = workQuery.value.trim();
    if (!query) return;
    workController?.abort();
    const controller = new AbortController();
    workController = controller;
    workResults.replaceChildren();
    workStatus.textContent = '正在搜索作品…';
    try {
      const result = await request('/api/me/story-card/works?' + new URLSearchParams({ q: query }), { signal: controller.signal });
      if (controller.signal.aborted) return;
      workStatus.textContent = result.rows.length ? '请选择一部作品。' : '没有找到匹配的作品，可以试试别名。';
      for (const work of result.rows) {
        const row = document.createElement('li');
        const select = button(work.title, () => {
          draft.works[activeSlot] = work;
          drawWorkSelection();
          updateCard();
          dialog.close();
        }, 'story-result');
        if (work.original && work.original !== work.title) {
          const detail = document.createElement('small');
          detail.textContent = work.original;
          select.append(detail);
        }
        row.append(select);
        workResults.append(row);
      }
    } catch (error) {
      if (!controller.signal.aborted) workStatus.textContent = error.message;
    }
  });

  const roleQuery = find('#story-bgm-query');
  const roleStatus = find('[data-story-bgm-status]');
  const rolePages = find('[data-story-bgm-pages]');
  const roleSource = find('[data-story-character-source]');
  let roleSearch;
  let roleResults = [];
  let lastRoleQuery = '';
  let rolePage = 1;
  let composing = false;
  function drawCharacterSelection() {
    find('[data-story-character-count]').textContent = draft.characters.length + ' / 10';
    const list = find('[data-story-characters]');
    list.replaceChildren();
    draft.characters.forEach((character, index) => {
      const row = document.createElement('li');
      const name = document.createElement('strong');
      name.textContent = character.name;
      const actions = document.createElement('div');
      actions.className = 'story-row-actions';
      if (draft.characters.length > 1) {
        const move = button('↑', () => {
          [draft.characters[index - 1], draft.characters[index]] = [draft.characters[index], draft.characters[index - 1]];
          drawCharacterSelection();
          list.children[index - 1].querySelector('button:not(:disabled)').focus();
          updateCard();
        });
        move.disabled = index === 0;
        move.setAttribute('aria-label', '上移' + character.name);
        actions.append(move);
      }
      const remove = button('移除', () => {
        draft.characters.splice(index, 1);
        drawCharacterSelection();
        drawCharacterResults();
        (list.children[Math.min(index, list.children.length - 1)]?.querySelector('button:last-child') || roleQuery).focus();
        updateCard();
      }, 'story-quiet');
      remove.setAttribute('aria-label', '移除' + character.name);
      actions.append(remove);
      const info = document.createElement('div');
      info.append(name);
      if (character.provider) {
        const provider = document.createElement('span');
        provider.textContent = character.provider;
        info.append(provider);
      }
      row.append(info, actions);
      list.append(row);
    });
  }
  function drawCharacterResults() {
    const list = find('[data-story-bgm-results]');
    list.replaceChildren();
    for (const character of roleResults) {
      const row = document.createElement('li');
      const info = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = character.name;
      info.append(name);
      const details = [character.original !== character.name ? character.original : '', character.work].filter(Boolean);
      if (details.length) {
        const context = document.createElement('small');
        context.textContent = details.join(' · ');
        info.append(context);
      }
      const source = document.createElement('a');
      source.className = 'story-quiet';
      source.target = '_blank';
      source.rel = 'noopener noreferrer';
      source.href = character.source;
      source.textContent = character.provider + ' ↗';
      source.setAttribute('aria-label', '查看 ' + character.provider + ' 上的' + character.name);
      info.append(source);
      const selected = draft.characters.some(item => item.id === character.id);
      const add = button(selected ? '已选' : '加入', () => {
        draft.characters.push(character);
        drawCharacterSelection();
        drawCharacterResults();
        updateCard();
        (list.querySelector('button:not(:disabled)') || roleQuery).focus();
      });
      add.disabled = selected || draft.characters.length >= 10;
      add.setAttribute('aria-label', add.textContent + character.name);
      if (character.image) {
        const img = document.createElement('img');
        img.loading = 'lazy';
        img.src = character.image;
        img.alt = '';
        row.append(img);
      }
      row.append(info, add);
      list.append(row);
    }
  }
  async function searchCharacters(query, page) {
    const keyword = query.trim();
    if (!keyword) {
      roleStatus.textContent = '请输入角色名。';
      return;
    }
    roleSearch?.abort();
    const controller = new AbortController();
    roleSearch = controller;
    roleStatus.textContent = '正在查询角色…';
    rolePages.hidden = true;
    roleResults = [];
    drawCharacterResults();
    try {
      const result = await request('/api/me/story-card/characters?' + new URLSearchParams({ q: keyword, page, source: roleSource.value }), { signal: controller.signal });
      if (controller.signal.aborted) return;
      rolePage = result.page;
      lastRoleQuery = keyword;
      roleResults = result.rows;
      drawCharacterResults();
      const count = result.total ?? result.rows.length;
      const status = result.rows.length
        ? (result.total == null ? '本页显示 ' : '找到 ') + count + ' 位相关角色。'
        : '本页没有匹配的角色，可以试试原名或别名。';
      const unavailable = result.unavailable?.length ? ' ' + result.unavailable.join('、') + ' 暂时不可用。' : '';
      roleStatus.textContent = status + unavailable;
      rolePages.hidden = rolePage === 1 && !result.hasNext;
      find('[data-story-bgm-page]').textContent = '第 ' + rolePage + ' 页';
      find('[data-story-bgm-prev]').disabled = rolePage === 1;
      find('[data-story-bgm-next]').disabled = !result.hasNext;
    } catch (error) {
      if (!controller.signal.aborted) roleStatus.textContent = error.message;
    }
  }
  find('[data-story-bgm-search]').addEventListener('click', () => searchCharacters(roleQuery.value, 1));
  roleSource.addEventListener('change', () => {
    const keyword = roleQuery.value.trim() || lastRoleQuery;
    if (keyword) searchCharacters(keyword, 1);
  });
  roleQuery.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    searchCharacters(roleQuery.value, 1);
  });
  find('[data-story-bgm-prev]').addEventListener('click', () => searchCharacters(lastRoleQuery, rolePage - 1));
  find('[data-story-bgm-next]').addEventListener('click', () => searchCharacters(lastRoleQuery, rolePage + 1));

  const preferenceGroups = [...studio.querySelectorAll('[data-story-preference]')];
  function drawPreferences() {
    for (const group of preferenceGroups) {
      const key = group.dataset.storyPreference;
      const values = draft.preferences[key] || [];
      const list = group.querySelector('[data-story-tags]');
      const input = group.querySelector('input');
      group.querySelector('[data-story-preference-count]').textContent = values.length + ' / 5';
      group.querySelector('[data-story-add-preference]').disabled = values.length === 5;
      input.disabled = values.length === 5;
      list.replaceChildren();
      for (const [index, value] of values.entries()) {
        const row = document.createElement('li');
        const label = document.createElement('span');
        label.textContent = value;
        const remove = button('×', () => {
          values.splice(index, 1);
          drawPreferences();
          input.focus();
          updateCard();
        }, 'story-tag-remove');
        remove.setAttribute('aria-label', '移除' + value);
        row.append(label, remove);
        list.append(row);
      }
    }
  }
  for (const group of preferenceGroups) {
    const input = group.querySelector('input');
    const status = group.querySelector('[data-story-preference-status]');
    function add() {
      const key = group.dataset.storyPreference;
      const value = input.value.trim();
      const values = draft.preferences[key] ||= [];
      status.hidden = true;
      if (!value || values.length >= 5) return;
      if (measure(value) > 60 || values.some(item => normalized(item) === normalized(value))) {
        status.textContent = measure(value) > 60 ? '每项最多 60 字。' : '已经添加过这一项。';
        status.hidden = false;
        return;
      }
      values.push(value);
      input.value = '';
      drawPreferences();
      if (!input.disabled) input.focus();
      else group.querySelector('[data-story-tags] li:last-child button')?.focus();
      updateCard();
    }
    input.addEventListener('compositionstart', () => { composing = true; });
    input.addEventListener('compositionend', () => { composing = false; });
    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.isComposing || composing) return;
      event.preventDefault();
      add();
    });
    input.addEventListener('input', () => { status.hidden = true; });
    group.querySelector('[data-story-add-preference]').addEventListener('click', add);
  }

  function loadImage(url) {
    if (!url || imageCache.has(url)) return;
    const entry = { image: null, done: false };
    imageCache.set(url, entry);
    entry.ready = (async () => {
      if (loading >= 5) await new Promise(resolve => waitingImages.push(resolve));
      loading++;
      try {
        entry.image = await new Promise(resolve => {
          const img = new Image();
          const finish = value => {
            clearTimeout(timer);
            img.onload = img.onerror = null;
            resolve(value);
          };
          const timer = setTimeout(() => { finish(null); img.src = ''; }, 9000);
          img.onload = () => finish(img);
          img.onerror = () => finish(null);
          img.src = url;
        });
      } finally {
        entry.done = true;
        loading--;
        waitingImages.shift()?.();
      }
    })();
  }

  function wrap(value, width, size, weight = 400) {
    context.font = font(size, weight);
    const tokens = value.match(/[a-zA-Z0-9]+(?:['’.:-][a-zA-Z0-9]+)*|\s+|[^\s]/gu) || [];
    const rows = [];
    let row = '';
    for (const token of tokens) {
      if (row && context.measureText(row + token).width > width) {
        rows.push(row.trimEnd());
        row = '';
      }
      if (context.measureText(token).width > width) {
        for (const letter of token) {
          if (context.measureText(row + letter).width > width) {
            rows.push(row);
            row = '';
          }
          row += letter;
        }
      } else if (row || token.trim()) row += token;
    }
    if (row.trim()) rows.push(row.trimEnd());
    return rows;
  }

  function paint() {
    const width = 1080, margin = 56, usable = width - margin * 2;
    const { paper, ink, muted, tint, highlight, line, mat, onTint } = colors();
    const leading = baseline => Math.ceil(baseline * Math.max(1, scales[draft.appearance.size]));
    const instructions = [];
    const rect = (x, y, w, h, fill) => instructions.push(() => {
      context.fillStyle = fill;
      context.fillRect(x, y, w, h);
    });
    const text = (value, x, y, size, fill = ink, weight = 400) => instructions.push(() => {
      context.fillStyle = fill;
      context.font = font(size, weight);
      context.textBaseline = 'top';
      context.fillText(value, x, y);
    });
    const paragraph = (rows, x, y, size, leading, color, weight) => rows.forEach((row, index) => text(row, x, y + index * leading, size, color, weight));
    const textWidth = (value, size, weight) => {
      context.font = font(size, weight);
      return context.measureText(value).width;
    };
    const image = (url, x, y, w, h, mode) => {
      rect(x, y, w, h, mat);
      const img = imageCache.get(url)?.image;
      if (!img) return;
      const ratio = (mode === 'cover' ? Math.max : Math.min)(w / img.naturalWidth, h / img.naturalHeight);
      const iw = img.naturalWidth * ratio, ih = img.naturalHeight * ratio;
      instructions.push(() => {
        context.save();
        context.beginPath();
        context.rect(x, y, w, h);
        context.clip();
        context.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
        context.restore();
      });
    };
    let y = 52;
    function section(label) {
      rect(margin, y, usable, 1, line);
      y += 28;
      text(label, margin, y, 29, ink, 650);
      y += 58;
    }

    rect(0, 0, width, 9, tint);
    text('Galgame 资历卡', margin, y, 27, highlight, 600);
    const displayName = draft.name || '未填写姓名';
    const nameWidth = usable - (data.avatar ? 150 : 0);
    const nameTop = y + 51;
    const nameWeight = 630;
    const nameStep = leading(66);
    const badge = 'LV' + data.level;
    const badgeWidth = Math.ceil(textWidth(badge, 21, 650)) + 26;
    const nameLines = wrap(displayName, nameWidth - badgeWidth - 22, 56, nameWeight);
    paragraph(nameLines, margin, nameTop, 56, nameStep, ink, nameWeight);
    const badgeX = margin + Math.ceil(textWidth(nameLines.at(-1), 56, nameWeight)) + 19;
    const badgeY = nameTop + (nameLines.length - 1) * nameStep + Math.round((nameStep - 36) / 2);
    rect(badgeX, badgeY, badgeWidth, 36, tint);
    text(badge, badgeX + 13, badgeY + 6, 21, onTint, 650);
    if (data.avatar) image(data.avatar, width - margin - 120, y + 12, 120, 120, 'cover');
    const socials = data.socials.filter(({ id }) => draft.socials[id]);
    let headerBottom = nameTop + nameLines.length * nameStep;
    if (socials.length) headerBottom += 6;
    for (const { id, icon } of socials) {
      const img = imageCache.get(icon)?.image;
      const rowTop = headerBottom;
      if (img) instructions.push(() => context.drawImage(img, margin, rowTop, 34, 34));
      const atX = margin + 47;
      text('@', atX, rowTop + 4, 24, muted, 600);
      const accountX = atX + Math.ceil(textWidth('@', 24, 600)) + 12;
      const account = wrap(draft.socials[id], nameWidth - accountX + margin, 24);
      paragraph(account, accountX, rowTop + 4, 24, leading(31), ink);
      headerBottom += Math.max(34, account.length * leading(31)) + 9;
    }
    y = Math.max(y + 157, headerBottom + 18);
    rect(margin, y, usable, 126, mat);
    const years = draft.startYear;
    const facts = [
      ['入坑经历', years ? (data.currentYear - years) + ' 年' : '—', years ? years + ' 年入坑' : ''],
      ['游玩数量', data.played + ' 部', '玩过 + 在玩'],
      ['注册时间', data.registeredDate ? data.registeredDate.replaceAll('-', '.') : '—', '视觉小说社区'],
    ];
    facts.forEach(([label, value, sub], index) => {
      const x = margin + index * usable / 3 + 22;
      if (index) rect(x - 22, y + 21, 1, 84, line);
      text(label, x, y + 16, 18, muted, 550);
      text(value, x, y + 44, 34, ink, 650);
      if (sub) text(sub, x, y + 92, 16, muted);
    });
    y += 175;

    const works = data.slots.flatMap(([key, label]) => draft.works[key] ? [[label, draft.works[key]]] : []);
    if (works.length) {
      section('我的五大神器');
      const gap = 20;
      const cellWidth = Math.min(262, (usable - (works.length - 1) * gap) / works.length);
      const inset = (usable - works.length * cellWidth - (works.length - 1) * gap) / 2;
      let labelSize = 17;
      while (labelSize > 12 && works.some(([label]) => textWidth(label, labelSize, 600) > cellWidth - 18)) labelSize--;
      const labelHeight = leading(21) + 16;
      let rowBottom = y;
      works.forEach(([label, work], index) => {
        const x = margin + inset + index * (cellWidth + gap);
        const pictureHeight = 230;
        rect(x, y, cellWidth, labelHeight, tint);
        text(label, x + 9, y + Math.round((labelHeight - Math.round(labelSize * scales[draft.appearance.size])) / 2), labelSize, onTint, 600);
        image(work.cover, x, y + labelHeight, cellWidth, pictureHeight, 'contain');
        const title = wrap(work.title, cellWidth - 8, 22, 600);
        const titleTop = y + labelHeight + pictureHeight + 13;
        paragraph(title, x, titleTop, 22, leading(29), ink, 600);
        rowBottom = Math.max(rowBottom, titleTop + title.length * leading(29));
      });
      y = rowBottom + 34;
    }

    if (draft.characters.length) {
      section('我推');
      const columns = 5, gap = 20, cellWidth = (usable - gap * (columns - 1)) / columns;
      for (let offset = 0; offset < draft.characters.length; offset += columns) {
        let rowBottom = y;
        draft.characters.slice(offset, offset + columns).forEach((role, index) => {
          const x = margin + index * (cellWidth + gap);
          image(role.image, x, y, cellWidth, 178, 'contain');
          const name = wrap(role.name, cellWidth - 5, 21, 600);
          paragraph(name, x, y + 188, 21, leading(27), ink, 600);
          rowBottom = Math.max(rowBottom, y + 188 + name.length * leading(27));
        });
        y = rowBottom + 25;
      }
      y += 12;
    }

    const preferences = data.preferences.filter(([key]) => draft.preferences[key]?.length);
    if (preferences.length) {
      section('我的偏好');
      const gap = 44, cellWidth = (usable - gap) / 2, columns = [y, y];
      preferences.forEach(([key, label]) => {
        const index = columns[0] <= columns[1] ? 0 : 1;
        const x = margin + index * (cellWidth + gap);
        let top = columns[index];
        text(label, x, top, 22, highlight, 650);
        top += 37;
        for (const value of draft.preferences[key]) {
          const rows = wrap(value, cellWidth - 19, 21);
          rect(x, top + 10, 5, 5, tint);
          paragraph(rows, x + 15, top, 21, leading(27), ink);
          top += rows.length * leading(27) + 5;
        }
        columns[index] = top + 27;
      });
      y = Math.max(...columns) + 5;
    }

    if (draft.note) {
      const rows = wrap(draft.note, usable - 60, 26);
      rect(margin, y, usable, 72 + rows.length * leading(36), mat);
      rect(margin, y, 5, 72 + rows.length * leading(36), tint);
      text('想说的一句话', margin + 27, y + 20, 17, highlight, 600);
      paragraph(rows, margin + 27, y + 50, 26, leading(36), ink);
      y += 107 + rows.length * leading(36);
    }
    rect(margin, y, usable, 1, line);
    text('视觉小说社区 · gal.example.com', margin, y + 23, 17, muted);
    const stamp = data.date.replaceAll('-', '.');
    text(stamp, width - margin - textWidth(stamp, 16), y + 23, 16, muted);
    canvas.width = width;
    canvas.height = y + 66;
    context.fillStyle = paper;
    context.fillRect(0, 0, width, canvas.height);
    for (const draw of instructions) draw();
    canvas.setAttribute('aria-label', displayName + '的资历卡，等级 ' + badge + '，' + works.length + ' 个作品席位，' + draft.characters.length + ' 位我推');
  }

  function prepareFont() {
    if (draft.appearance.font !== 'serif' || !document.fonts) return null;
    const sample = [
      'Galgame 资历卡 LV0123456789 入坑经历 年 游玩数量 部 玩过在玩 注册时间 视觉小说社区 我的五大神器 我推 我的偏好 想说的一句话',
      draft.name, draft.note, ...Object.values(draft.socials), ...Object.values(draft.works).map(work => work.title),
      ...draft.characters.map(role => role.name), ...Object.values(workLabels),
      ...data.preferences.map(([, label]) => label), ...Object.values(draft.preferences).flat(),
    ].join(' ');
    const spec = '400 24px ' + serif;
    return document.fonts.check(spec, sample) ? null : document.fonts.load(spec, sample).catch(() => []);
  }

  function report(message) {
    feedback.hidden = !message;
    feedback.textContent = message;
  }
  function render() {
    exportPanel.hidden = true;
    if (!context) {
      report('当前浏览器无法生成长图。');
      return;
    }
    const revision = ++drawingRevision;
    const icons = data.socials.filter(({ id }) => draft.socials[id]).map(({ icon }) => icon);
    const urls = [...new Set([data.avatar, ...icons, ...Object.values(draft.works).map(work => work.cover), ...draft.characters.map(character => character.image)].filter(Boolean))];
    for (const url of urls) loadImage(url);
    const pendingFont = prepareFont();
    const loading = urls.some(url => !imageCache.get(url)?.done);
    const finish = () => {
      if (revision !== drawingRevision) return;
      paint();
      const failed = urls.filter(url => !imageCache.get(url)?.image).length;
      retry.hidden = !failed;
      download.disabled = false;
      report(failed ? failed + ' 张图片暂未加载，文字仍会保留。' : '');
    };
    if (!loading && !pendingFont) return finish();
    download.disabled = true;
    retry.hidden = true;
    report(loading ? '正在加载预览图片…' : '正在加载长图字体…');
    paint();
    Promise.all([...urls.map(url => imageCache.get(url).ready), pendingFont]).then(finish);
  }
  retry.addEventListener('click', () => {
    for (const [url, entry] of imageCache) if (entry.done && !entry.image) imageCache.delete(url);
    render();
  });
  download.addEventListener('click', async () => {
    download.disabled = true;
    const revision = drawingRevision;
    try {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error();
      if (exportUrl) URL.revokeObjectURL(exportUrl);
      exportUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = exportUrl;
      link.download = '视觉小说社区-资历卡-' + data.date + '.png';
      document.body.append(link);
      link.click();
      link.remove();
      exportLink.href = exportUrl;
      exportPanel.hidden = false;
      report('长图已在本机生成。');
    } catch {
      report('长图暂时无法保存，请重试。');
    } finally {
      if (revision === drawingRevision) download.disabled = false;
    }
  });

  fillTextFieldState();
  drawWorkSelection();
  drawCharacterSelection();
  drawPreferences();
  render();
})();
