import { esc } from './lib/utils.js';
import { displayName, publicProfileUrl } from './lib/identity.js';
import { avatarMarkup } from './lib/avatars.js';
import { levelBadge } from './lib/member-levels.js';
import { withWorkMedia } from './lib/work-media.js';

const titleOf = game => game.chineseName || game.name;
const states = { done: '玩过', doing: '在玩', wish: '想玩', dropped: '弃坑' };
const reason = match => [match.commonLiked ? `共同喜欢 ${match.commonLiked} 部` : '', match.close ? `${match.close} 部评分接近` : '', !match.commonLiked && match.commonPlayed ? `共同游玩 ${match.commonPlayed} 部` : ''].filter(Boolean).join('，');

function cover(game) {
  const media = withWorkMedia(game);
  return media.mainImg ? `<img src="${esc(media.mainImg)}" alt="${esc(titleOf(game))}封面" loading="lazy" width="64" height="88">` : '<span class="td-cover-placeholder">暂无封面</span>';
}

export function tasteDiscoveryPanel({ view, members, games, open = false }) {
  const cards = view.matches.map(match => {
    const member = members.get(match.userId);
    if (!member) return '';
    const common = match.shared.map(row => games.get(row.gameId)).filter(Boolean);
    return `<article class="td-card"><div class="td-card-copy"><header><a class="td-member" href="${esc(publicProfileUrl(member))}">${avatarMarkup(member,38)}<span><strong>${esc(displayName(member))}</strong><small>${levelBadge(member.progress)}<span>UID ${esc(member.uid)}</span></small></span></a><span class="td-label${match.label === '偏好接近' ? ' td-label-close' : ''}">${match.label}</span></header><p class="td-reason">${reason(match)}</p><footer><a href="${esc(publicProfileUrl(member))}">查看主页 ↗</a><a href="/me/similar/${member.uid}" data-taste-compare>比较作品 →</a></footer></div><div class="td-common" aria-label="共同作品">${common.map(game => `<a href="/game/${game.gid}" title="${esc(titleOf(game))}" aria-label="${esc(titleOf(game))}">${cover(game)}</a>`).join('')}</div></article>`;
  }).join('');
  const empty = !view.enabled ? ['从喜欢的故事，遇见同好。', '开启后，根据公开评分与游玩状态推荐兴趣相近的群友，你也会出现在他人的推荐中。'] : view.recordCount < 3 ? ['多留下几部作品，会更容易遇见同好。', '当前记录较少，有共同喜好时会标为「初步推荐」。可以先给喜欢的作品留下评分。'] : ['同好的故事，还在慢慢汇集。', '目前没有找到足够相近的公开记录。更多群友参与或作品记录增加后，推荐会更新。'];
  const peek = view.matches.slice(0,3).map(match => members.get(match.userId)).filter(Boolean);
  return `<section class="td-entry" id="like-minded"><div class="td-entry-heading"><span aria-hidden="true">✧</span><h2>同好推荐</h2>${view.enabled ? '<small>已开启</small>' : ''}</div><p>${view.enabled ? view.matches.length ? `${view.matches.length} 位群友，与你有共同的故事` : '寻找与你偏好接近的人' : '从喜欢的作品，遇见同好。'}</p><div class="td-entry-action">${peek.length ? `<span class="td-avatar-stack" aria-hidden="true">${peek.map(member=>avatarMarkup(member,26)).join('')}</span>` : '<small>参与由你决定</small>'}<button type="button" data-taste-open aria-haspopup="dialog" aria-controls="taste-discovery-dialog">${view.enabled ? '看看同好' : '了解并开启'} <span aria-hidden="true">↗</span></button></div></section>
  <dialog class="td-dialog" id="taste-discovery-dialog" aria-labelledby="taste-dialog-title" data-taste-auto-open="${open ? '1' : '0'}"><header class="td-dialog-header"><div><h2 id="taste-dialog-title">同好推荐</h2><p>从共同的故事，认识偏好接近的人。</p></div><button type="button" data-taste-close aria-label="关闭同好推荐">×</button></header><div class="td-dialog-scroll"><div data-taste-list>${cards ? `<div class="td-grid">${cards}</div>` : `<div class="td-empty"><span aria-hidden="true">✧</span><div><h3>${empty[0]}</h3><p>${empty[1]}</p>${view.enabled && view.recordCount < 3 ? '<a href="/games?local=1">去作品库留下记录 ↗</a>' : ''}</div></div>`}<div class="td-settings"><div><strong>${view.enabled ? '已参与同好推荐' : '由你决定是否参与'}</strong><p>${view.enabled ? '仅使用公开作品记录；关闭后立即退出，不发匹配通知。' : '默认关闭。开启后，你也会被推荐给其他参与者。'}</p></div><form method="post" action="/api/me/taste-discovery"><button class="btn ${view.enabled ? 'btn-ghost' : 'btn-primary'} btn-sm" name="enabled" value="${view.enabled ? '0' : '1'}">${view.enabled ? '关闭推荐' : '开启同好推荐'}</button></form></div><details class="td-explanation"><summary>推荐依据</summary><p>双方给出 8 分及以上的作品视为共同喜欢；同时参考评分差异与游玩记录。热门作品的影响会适当降低，少量共同记录标为「初步推荐」。会社与脚本偏好暂不参与。</p></details></div><div data-taste-comparison hidden></div></div><p class="td-dialog-feedback" role="status" aria-live="polite" hidden></p></dialog>`;
}

export function tasteComparisonPage({ member, match, games, embedded = false }) {
  const rows = match.shared.slice(0, 60).map(row => {
    const game = games.get(row.gameId);
    if (!game) return '';
    return `<article class="td-compare-row"><a class="td-compare-game" href="/game/${game.gid}">${cover(game)}<span><strong>${esc(titleOf(game))}</strong><small>${row.bothLiked ? '共同喜欢' : row.bothPlayed ? '共同游玩' : '共同记录'}</small></span></a><div class="td-compare-score"><span>我<small>${row.myScore === null ? '未评分' : row.myScore + ' 分'}${row.myStatus ? ' · ' + (states[row.myStatus] || '') : ''}</small></span><span>${esc(displayName(member))}<small>${row.theirScore === null ? '未评分' : row.theirScore + ' 分'}${row.theirStatus ? ' · ' + (states[row.theirStatus] || '') : ''}</small></span></div></article>`;
  }).join('');
  return `<section class="td-comparison">${embedded ? '<button class="td-back" type="button" data-taste-back>← 返回推荐名单</button>' : '<a class="td-back" href="/me?discovery=1#like-minded">← 返回同好推荐</a>'}<header><div>${avatarMarkup(member,embedded?38:56)}<${embedded?'h3':'h1'}>与 ${esc(displayName(member))} 的共同故事</${embedded?'h3':'h1'}></div><p>${match.label} · ${reason(match)}</p><a href="${esc(publicProfileUrl(member))}">查看对方主页 ↗</a></header><div class="td-compare-list">${rows}</div>${match.sharedCount > 60 ? '<p class="td-limit">这里展示前 60 部共同作品，完整记录可查看公开主页。</p>' : ''}</section>`;
}
