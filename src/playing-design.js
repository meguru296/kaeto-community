import { esc } from './lib/utils.js';
import {playingMembers} from './playing-members-design.js';

export function playingPage(games, params, gameCard, pagination) {
  const size = 24, pages = Math.max(1, Math.ceil(games.length / size));
  const page = Math.min(pages, Math.max(1, Number.parseInt(params.get('page'),10) || 1));
  const sort = params.get('sort') === 'recent' ? 'recent' : 'popular';
  const selected = games.slice((page-1)*size,page*size);
  return `<section class="playing-page"><header class="playing-heading"><p class="eyebrow">PLAYING NOW / COMMUNITY SHELF</p><h1>群友最近在玩</h1><p>看看大家正在经历哪些故事。只展示当前标记为「在玩」的作品，随打卡状态更新。</p><a class="text-link" href="/games?local=1">浏览全部已收录作品 ↗</a></header><div class="playing-toolbar"><p>共 <strong>${games.length}</strong> 部作品 · 第 ${page} / ${pages} 页</p><form method="get" action="/playing"><label for="playing-sort">排序</label><select id="playing-sort" name="sort"><option value="popular" ${sort==='popular'?'selected':''}>在玩人数最多</option><option value="recent" ${sort==='recent'?'selected':''}>最近在玩动态</option></select><button class="btn" type="submit">应用</button></form></div>${selected.length?`<div class="grid playing-grid">${selected.map(game=>`<article>${gameCard(game)}${playingMembers(game)}</article>`).join('')}</div>`:'<div class="empty"><p>还没有群友标记在玩，下一段故事等你开始。</p><a href="/games?local=1">去作品库看看 ↗</a></div>'}${pagination('/playing?sort='+esc(sort),page,page<pages,games.length,size)}</section>`;
}
