import { displayName } from './lib/identity.js';
import { avatarFor, avatarMarkup } from './lib/avatars.js';
import { esc } from './lib/utils.js';
import { reviewStickers, legacyReviewStickers } from './lib/review-text.js';

export function reviewEditor({ game, user, review, returnTo = '' }) {
  const redirect = `/game/${game.gid}${returnTo ? '?return=' + encodeURIComponent(returnTo) : ''}#work-reviews`;
  return `<section class="fr-composer" id="review-composer" aria-labelledby="composer-heading">
    <header class="fr-heading">${avatarMarkup(user,42,"")}<div><h3 id="composer-heading">${review ? '编辑我的评价' : '写一段作品评价'}</h3><p>${esc(displayName(user))} · 一部作品，一份自己的感想</p></div><span>文字与星标表情</span></header>
    <form method="post" action="/api/review" data-review-form>
      <input type="hidden" name="gid" value="${game.gid}"><input type="hidden" name="redirect" value="${esc(redirect)}">
      <label for="review-title">评价标题 <small>可选</small></label><input class="input fr-title" id="review-title" name="title" maxlength="60" value="${esc(review?.title || '')}" placeholder="用一句话概括你的感想">
      <div class="fr-toolbar"><div role="group" aria-label="编辑与预览"><button type="button" data-review-edit aria-pressed="true">写评价</button><button type="button" data-review-preview aria-pressed="false">预览</button></div><button type="button" data-stickers-toggle aria-expanded="false" aria-controls="review-stickers">星标表情 <span aria-hidden="true">☺</span></button></div>
      <div class="fr-sticker-picker" id="review-stickers" hidden><p>24 个星标动图 · 点击插入 · 与文字共用 2000 字额度</p><div>${reviewStickers.map(sticker => `<button type="button" data-review-sticker="${esc(sticker.token)}" data-sticker-url="${sticker.url}" aria-label="插入星标表情：${esc(sticker.name)}"><img src="${sticker.preview}" data-sticker-animation="${sticker.url}" data-sticker-hover alt="" width="52" height="52" loading="lazy"><span>${esc(sticker.name)}</span></button>`).join('')}</div></div>
      <span hidden data-legacy-stickers>${legacyReviewStickers.map(sticker => `<span data-review-sticker="${esc(sticker.token)}" data-sticker-url="${sticker.url}"></span>`).join('')}</span>
      <label class="sr-only" for="review-content">作品评价正文</label><textarea id="review-content" name="content" maxlength="2000" minlength="2" required rows="7" aria-describedby="review-help review-count" placeholder="剧情留下了什么？哪个角色让你记住？音乐、画风，或一句想分享的话……">${esc(review?.content || '')}</textarea>
      <div class="fr-preview" data-review-preview-body hidden aria-label="评价预览"></div>
      <footer class="fr-footer"><p id="review-help">2—2000 字 · Ctrl / ⌘ + Enter 提交<br>评价单独保存，保留已有评分与进度。</p><div><span id="review-count" data-review-count>${(review?.content || '').length} / 2000</span><button class="btn btn-primary" type="submit">${review ? '保存评价 →' : '发表评价 →'}</button></div></footer>
      <p class="fr-feedback" data-review-feedback role="status"></p>
    </form>
  </section>`;
}
