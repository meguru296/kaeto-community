import { esc, jsonForScript } from './lib/utils.js';
import { storyWorkSlots, storyPreferences, storySocials, storyPalettes } from './lib/story-card.js';
import { storyCharacterSources } from './lib/story-characters.js';

export function storyCardPage(data) {
  const tabs = [['profile', '资料'], ['works', '作品'], ['characters', '角色'], ['preferences', '偏好'], ['appearance', '外观']];
  const slots = Object.entries(storyWorkSlots);
  const preferences = Object.entries(storyPreferences);
  const socials = Object.entries(storySocials).map(([id, label]) => ({ id, label, icon: '/img/story-card/' + id + '.svg' }));
  const appearance = data.draft.appearance;
  const options = (items, selected) => items.map(([value, label]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`).join('');
  const registration = data.registeredDate ? data.registeredDate.split('-').map(Number) : null;
  return `<section class="story-studio" data-story-studio>
    <header class="story-heading">
      <div><a class="text-link" href="/me">← 个人中心</a><h1>我的资历卡</h1>
      <p>编辑内容并保存到账户，随时导出个人长图。</p></div>
      <a class="story-jump" href="#story-preview">查看长图 ↓</a>
    </header>
    <noscript><p class="flash">请启用 JavaScript，才能编辑资历卡和导出长图。</p></noscript>
    <div class="story-layout">
      <form class="story-editor" data-story-controls>
        <div class="story-tabs" role="tablist" aria-label="编辑资历卡">
          ${tabs.map(([id, label], i) => `<button type="button" role="tab" id="story-tab-${id}" aria-controls="story-panel-${id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-story-tab="${id}">${label}</button>`).join('')}
        </div>
        <section id="story-panel-profile" role="tabpanel" aria-labelledby="story-tab-profile" data-story-panel="profile">
          <label class="story-field" for="story-name">姓名（ID / CN）</label>
          <input class="input" id="story-name" name="name" required maxlength="64" value="${esc(data.draft.name)}">
          <details class="story-social-fields"${Object.keys(data.draft.socials).length ? ' open' : ''}>
            <summary>社交账号 <small>选填</small></summary>
            ${socials.map(({ id, label, icon }) => `<div class="story-social-field"><label for="story-social-${id}"><img src="${icon}" width="24" height="24" alt="">${label}</label><input class="input" id="story-social-${id}" data-story-social="${id}" maxlength="98" placeholder="账号名或昵称" value="${esc(data.draft.socials[id] || '')}"></div>`).join('')}
          </details>
          <label class="story-field" for="story-year">入坑年份</label>
          <div class="story-year"><input class="input" type="number" inputmode="numeric" id="story-year" name="startYear" min="1980" max="${data.currentYear}" step="1" placeholder="例如 2019" value="${data.draft.startYear ?? ''}"><output for="story-year" data-story-years></output></div>
          <div class="story-account-facts">
            <div><span>游玩数量</span><strong>${data.played} 部</strong><small>含玩过与在玩</small></div>
            <div><span>注册时间</span><strong>${registration ? registration[0] + '年' + registration[1] + '月' + registration[2] + '日' : '暂无'}</strong><small>来自本站账号</small></div>
          </div>
          <label class="story-field" for="story-note">想说的一句话 <span data-story-note-count>0 / 50</span></label>
          <textarea class="input" id="story-note" name="note" rows="3" maxlength="100" placeholder="留给看到这张卡的同好">${esc(data.draft.note)}</textarea>
        </section>
        <section id="story-panel-works" role="tabpanel" aria-labelledby="story-tab-works" data-story-panel="works" hidden>
          <h2>我的五大神器</h2>
          <p class="story-help">每个席位可从本站作品库选一部。</p>
          <ul class="story-selections" data-story-slots>
            ${slots.map(([slot, label]) => `<li data-story-slot="${slot}"><div><strong>${label}</strong><span data-story-work-name>未选择</span></div><div class="story-row-actions"><button class="story-quiet" type="button" data-story-clear-work="${slot}" aria-label="移除${label}" hidden>移除</button><button class="story-small-button" type="button" data-story-pick-work="${slot}" aria-label="选择${label}">选择</button></div></li>`).join('')}
          </ul>
        </section>
        <section id="story-panel-characters" role="tabpanel" aria-labelledby="story-tab-characters" data-story-panel="characters" hidden>
          <h2>我推 <span data-story-character-count>0 / 10</span></h2>
          <label class="story-field" for="story-bgm-query">角色名</label>
          <div class="story-search-row"><input class="input" type="search" id="story-bgm-query" maxlength="80" placeholder="输入中文名、原名或别名"><button class="story-small-button" type="button" data-story-bgm-search>搜索</button></div>
          <label class="story-character-filter">来源
            <select class="input" data-story-character-source>${options([['all', '全部来源'], ...Object.entries(storyCharacterSources)], 'all')}</select>
          </label>
          <p class="story-help" data-story-bgm-status role="status">可从 Bangumi、CnGal、VNDB 选入最多 10 位角色。</p>
          <ul class="story-results" data-story-bgm-results></ul>
          <nav class="story-search-pages" aria-label="角色结果翻页" data-story-bgm-pages hidden><button type="button" class="story-small-button" data-story-bgm-prev>上一页</button><span data-story-bgm-page></span><button type="button" class="story-small-button" data-story-bgm-next>下一页</button></nav>
          <ul class="story-selections" aria-label="已选角色" data-story-characters></ul>
        </section>
        <section id="story-panel-preferences" role="tabpanel" aria-labelledby="story-tab-preferences" data-story-panel="preferences" hidden>
          <h2>偏好</h2><p class="story-help">每栏最多 5 项。输入后按 Enter 或点添加。</p>
          ${preferences.map(([key, label]) => `<div class="story-preference" data-story-preference="${key}">
            <label class="story-field" for="story-pref-${key}">${label}<span data-story-preference-count>0 / 5</span></label>
            <div class="story-search-row"><input class="input" id="story-pref-${key}" maxlength="120" data-story-preference-input><button class="story-small-button" type="button" aria-label="添加${label}" data-story-add-preference>添加</button></div>
            <ul class="story-tags" data-story-tags></ul><p class="story-help" role="status" data-story-preference-status hidden></p>
          </div>`).join('')}
        </section>
        <section id="story-panel-appearance" role="tabpanel" aria-labelledby="story-tab-appearance" data-story-panel="appearance" hidden>
          <fieldset class="story-palette">
            <legend>长图配色</legend>
            ${Object.entries(storyPalettes).map(([id, { label, background, accent }]) => `<label class="story-palette-option"><input type="radio" name="palette" value="${id}"${id === appearance.palette ? ' checked' : ''}><span class="story-palette-swatch" style="--story-swatch:${background};--story-dot:${accent}" aria-hidden="true"></span>${label}</label>`).join('')}
            <label class="story-palette-option story-palette-custom"><input type="radio" name="palette" value="custom"${appearance.palette === 'custom' ? ' checked' : ''}>自定义配色</label>
          </fieldset>
          <div class="story-color-fields" data-story-custom-colors${appearance.palette === 'custom' ? '' : ' hidden'}>
            <label for="story-background">底色 <input type="color" name="background" id="story-background" value="${esc(appearance.background)}"></label>
            <label for="story-accent">强调色 <input type="color" name="accent" id="story-accent" value="${esc(appearance.accent)}"></label>
          </div>
          <label class="story-field" for="story-font">长图字体</label>
          <select class="input" id="story-font" name="font">${options([['sans','黑体'],['serif','宋体']], appearance.font)}</select>
          <div class="story-type-options">
            <div><label class="story-field" for="story-weight">字重</label><select class="input" id="story-weight" name="weight">${options([['light','偏细'],['regular','标准'],['bold','偏粗']], appearance.weight)}</select></div>
            <div><label class="story-field" for="story-size">字号</label><select class="input" id="story-size" name="size">${options([['compact','紧凑'],['standard','标准'],['large','加大']], appearance.size)}</select></div>
          </div>
        </section>
        <footer class="story-save-bar">
          <div><strong>云端草稿</strong><p data-story-save-status role="status">${data.savedAt ? '已载入上次保存的资料。' : '保存后可在其他设备继续编辑。'}</p></div>
          <button class="btn btn-primary" type="submit" data-story-save>保存资料</button>
        </footer>
      </form>
      <section class="story-preview" id="story-preview" aria-labelledby="story-preview-title">
        <div class="story-preview-toolbar"><h2 id="story-preview-title">长图预览</h2><button class="story-small-button" type="button" data-story-download disabled>保存长图 PNG ↓</button></div>
        <p class="story-help story-export-hint">在当前浏览器生成 PNG。不上传生成的图片。</p>
        <p class="story-feedback" data-story-feedback role="status" hidden></p>
        <button class="story-quiet" type="button" data-story-retry hidden>重新加载缺失图片</button>
        <div class="story-paper"><canvas data-story-canvas width="1080" height="480" role="img" aria-label="资历卡长图预览"></canvas></div>
        <section class="story-export" data-story-export data-image-download="allow" hidden><a class="text-link" data-story-export-link target="_blank" rel="noopener">打开生成的 PNG 图片 ↗</a><p class="story-help">如果浏览器没有自动保存，可打开图片后保存到相册。</p></section>
      </section>
    </div>
    <dialog class="story-dialog" data-story-work-dialog aria-labelledby="story-work-dialog-title">
      <div class="story-dialog-heading"><h2 id="story-work-dialog-title">选择作品</h2><button class="story-small-button" type="button" data-story-close-dialog>关闭</button></div>
      <form data-story-work-search><label class="story-field" for="story-work-query">搜索本站作品库</label><div class="story-search-row"><input class="input" type="search" id="story-work-query" maxlength="100" required placeholder="输入作品名或别名"><button class="story-small-button" type="submit">搜索</button></div></form>
      <p class="story-help" role="status" data-story-work-status></p><ul class="story-results" data-story-work-results></ul>
    </dialog>
    <script type="application/json" data-story-data>${jsonForScript({ ...data, slots, preferences, socials, palettes: storyPalettes })}</script>
  </section>`;
}
