import { levelBadge,levelFor } from './lib/member-levels.js';
import { memberSourcePicker } from './member-source-design.js';
import { displayName,publicProfileUrl } from './lib/identity.js';
import { releaseLabel } from './updates.js';
import { reviewInteractions } from './review-social-design.js';
import { pageAssets, browserTheme, subahibiStyles, subahibiScripts, shopStyles, shopScripts, runtimeStyles, runtimeScripts } from './lib/browser-assets.js';
import { siteEditorControls } from './site-admin.js';
import { pwaControls } from './pwa-design.js';
import { guestWelcome } from './guest-welcome-design.js';
import { busyMessage } from './lib/traffic-protection.js';
import { isSuperAdmin } from './lib/site-content.js';
import { reviewEditor } from './review-editor.js';
import { renderReviewText } from './lib/review-text.js';
import { avatarFor, avatarMarkup } from './lib/avatars.js';
import { catalogPage, rankingPage } from './catalog-design.js';
import { memberProfile, communityWall, recordEditor } from './member-design.js';
import { festivalDetails } from './festival-details.js';
import { withWorkMedia } from './lib/work-media.js';
import { detailDesign } from './detail-design.js';
import { accountDesign } from './account-design.js';
import { esc, jsonForScript, fmtScore, scoreTone, scoreLabel, fmtDate, fromNow, scoreDistribution, SCORE_BANDS } from './lib/utils.js';
import { annualPage } from './experience.js';
import { battlePage } from './battle-design.js';
import { homeCommunity, festivalPage, journalPage, journalEntry, aboutPage } from './community.js';

/* ------------------------------------------------------------------ *
 * 页面渲染（服务端直出 HTML + 少量原生 JS 增强）
 * ------------------------------------------------------------------ */

export function layout({ config, user, title, body, active = '', extraHead = '', bodyClass = '', battleVisible = false }) {
  const site = config.site;
  const subahibi = body.includes('data-subahibi-page');
  const subahibiPilgrimage = body.includes('class="sh-pilgrimage-return"');
  const shop = body.includes('data-shop-page');
  const runtime = body.includes('data-runtime-page');
  const assets=pageAssets({active,bodyClass,body});
  const nav = [
    ['/', '首页', 'home'],
    ['/festival/2027', '拜年祭', 'festival'],
    ['/games?local=1', '作品库', 'games'],
    ['/music', '音乐', 'music'],
    ['/rank', '排行榜', 'rank'],
    ['/collection', '打卡', 'collection'],
    ['/lists', '列表', 'lists'],
    ['/annual/2025', '十二江器', 'annual'],
    ['/journal', '群刊', 'journal'],
    ['/battle', '萌战', 'battle'],
    ['/pilgrimage', '巡礼', 'pilgrimage'],
    ['/about', '关于', 'about'],
    ['/shop', '通贩', 'shop'],
  ];
  const navLink=([href,label,key])=>`<a class="nav-link${key==='festival'?' nav-festival':''}${active===key?' is-active':''}" ${active===key?'aria-current="page"':''} href="${href}">${esc(label)}</a>`;
  const groups=[['发现与记录',['games','music','rank','collection','lists']],['创作与活动',['festival','annual','journal','battle']],['风景与我们',['pilgrimage','shop','about']]];
  const navHtml=navLink(nav[0])+groups.map(([label,keys])=>`<div class="nav-group"><small class="nav-group-caption">${label}</small><div>${keys.map(key=>nav.find(n=>n[2]===key)).filter(n=>n[2]!=='pilgrimage'||config.pilgrimage?.enabled===true).map(navLink).join('')}</div></div>`).join('');

  const userLevel = user?.progress ? levelBadge(user.progress) : '';
  const accountLevel=levelFor(user?.progress?.xp||0);
  const accountProgress=user?`<div class="account-menu-experience"><div><span>LV${accountLevel.level} · ${esc(accountLevel.name)}</span><strong>${accountLevel.earned} EXP</strong></div><progress max="100" value="${accountLevel.percent}" aria-label="等级经验进度" aria-valuetext="${accountLevel.earned} EXP${accountLevel.next?'，距 LV'+accountLevel.next.level+' 还需 '+(accountLevel.next.xp-accountLevel.earned)+' EXP':'，已达最高等级'}">${accountLevel.percent}%</progress><small>${accountLevel.next?'距 LV'+accountLevel.next.level+' 还需 '+(accountLevel.next.xp-accountLevel.earned)+' EXP':'已达最高等级，继续收藏你的故事。'}</small></div>`:'';
  const unread = user?.notificationCount || 0;
  const inbox = user ? `<a class="nav-inbox" href="/messages" data-inbox-link aria-label="${unread?'站内消息，'+unread+' 条未读':'站内消息'}" title="消息中心"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/></svg><span class="nav-inbox-count" data-inbox-count${unread?'':' hidden'}>${unread>99?'99+':unread}</span></a>` : '';
  const userHtml = user
    ? `<div class="nav-user">
         <details class="account-menu" data-account-menu><summary class="nav-link nav-account" aria-label="账号菜单：${esc(displayName(user))}">${avatarMarkup(user,26,'member-avatar')}<span class="nav-identity"><span class="nav-identity-line"><span class="nav-name">${esc(displayName(user))}</span>${userLevel}</span><small class="nav-uid">UID ${esc(user.uid || user.id)}</small></span><i class="account-menu-caret" aria-hidden="true">⌄</i></summary><section class="account-menu-panel" aria-label="账号快捷菜单"><header><a class="account-menu-profile" href="${esc(publicProfileUrl(user))}" aria-label="查看${esc(displayName(user))}的主页"><strong>${esc(displayName(user))}<span aria-hidden="true"> ↗</span></strong><small>UID ${esc(user.uid||user.id)}</small></a>${accountProgress}</header><nav aria-label="账号快捷入口"><a href="/me">个人中心 <span>↗</span></a><a href="/me/story-card">生成我的资历卡 <span>↗</span></a><a href="/me/lists">我的作品清单 <span>↗</span></a><a href="/messages">站内消息 <span>${unread?unread+' 条未读':'↗'}</span></a>${user.isAdmin?`<a href="/admin">管理后台 <span>↗</span></a><a href="/admin/corrections">纠错收件箱 <span>↗</span></a>`:''}${isSuperAdmin(user)?'<a href="/admin/site">内容与素材 <span>↗</span></a><a href="/admin/runtime">运行状态 <span>↗</span></a>':''}</nav><form method="post" action="/api/preferences/covers" class="account-cover-preference" data-cover-preference><input type="hidden" name="redirect" value="/me"><label><span><strong>显示 R18 原封面</strong><small>开启后直接显示未遮挡封面</small></span><input type="checkbox" name="value" value="on" ${user.showOriginalCovers===true?'checked':''} role="switch" aria-label="显示 R18 原封面"></label><button type="submit">应用设置</button><p>偏好保存在你的账号中。</p></form><form method="post" action="/logout" class="account-menu-logout"><button type="submit">退出登录</button></form></section></details>${user.isAdmin ? `<a class="badge-admin nav-admin-shortcut" href="/admin" aria-label="${isSuperAdmin(user)?'超级管理员后台':'管理后台'}">${isSuperAdmin(user)?'超级管理员':'管理后台'}</a>` : ''}
       </div>`
    : `<div class="nav-user">
         <a class="nav-link" href="/login">登录</a>
         <a class="btn btn-primary btn-sm" href="/register">注册</a>
       </div>`;

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title ? `${title} · ${site.name}` : site.name)}</title>
<meta name="description" content="${esc(site.tagline)}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#fffafb">
<meta name="apple-mobile-web-app-title" content="视觉小说社区">
<link rel="manifest" href="/manifest.webmanifest">
<script src="${browserTheme.url}"></script>
<link rel="stylesheet" href="${assets.styles.url}">
${subahibi||subahibiPilgrimage?`<link rel="stylesheet" href="${subahibiStyles.url}">`:''}
${shop?`<link rel="stylesheet" href="${shopStyles.url}">`:''}
${runtime?`<link rel="stylesheet" href="${runtimeStyles.url}">`:''}
<link rel="icon" href="/favicon.ico?v=1.2" sizes="16x16 32x32 48x48" type="image/x-icon">
<link rel="icon" href="/img/site/favicon-32.png?v=1.2" sizes="32x32" type="image/png">
<link rel="icon" href="/img/site/icon-192.png?v=1.2" sizes="192x192" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png?v=1.2" sizes="180x180">
${extraHead}
</head>
<body class="${esc(bodyClass)}" data-authenticated="${user ? '1' : '0'}">
<a class="skip-link" href="#main-content">跳到主要内容</a>
<div class="reading-progress" aria-hidden="true"></div>
<header class="topbar">
  <div class="wrap topbar-inner">
    <a class="brand" href="/">
      <img class="brand-mark" src="/img/community/avatar.webp" alt="" width="32" height="32">
      <span class="brand-name">${esc(site.name)}</span>
    </a>
    <nav class="nav" id="site-navigation" aria-label="主导航">${navHtml}${user ? '<div class="nav-mobile-account"><a href="/me">个人中心 ↗</a><form method="post" action="/logout"><button class="btn btn-ghost" type="submit">退出登录</button></form></div>' : ''}</nav>
    <div class="nav-right"><a class="nav-search" href="/games?local=1" aria-label="搜索作品"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg></a><details class="theme-picker"><summary aria-label="颜色主题" title="颜色主题"><svg class="theme-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M20.3 14.4A8.5 8.5 0 0 1 9.6 3.7a8.5 8.5 0 1 0 10.7 10.7Z"/></svg><svg class="theme-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/></svg><span class="sr-only">颜色主题</span></summary><div class="theme-menu" role="group" aria-label="选择颜色主题"><p>颜色主题</p><button type="button" data-theme-choice="light" aria-pressed="false"><span>浅色</span><small>明亮的日常</small><i aria-hidden="true">✓</i></button><button type="button" data-theme-choice="dark" aria-pressed="false"><span>夜间</span><small>柔和的深灰紫</small><i aria-hidden="true">✓</i></button><button type="button" data-theme-choice="system" aria-pressed="true"><span>跟随系统</span><small>自动切换</small><i aria-hidden="true">✓</i></button><div class="theme-feedback" role="status" aria-live="polite"></div></div></details>${inbox}${userHtml}<button class="menu-toggle" type="button" aria-controls="site-navigation" aria-expanded="false" aria-label="展开导航"><span></span><span></span></button></div>
  </div>
</header>
<main class="wrap main" id="main-content">
${config.trafficProtection?.mode==='busy'?`<aside class="traffic-busy-notice" role="status">${esc(busyMessage)}<a href="/games?local=1">浏览已收录作品 →</a></aside>`:''}
<button class="pwa-app-back" type="button" data-pwa-back hidden>← 返回上一页</button>
${body}
</main>
<footer class="footer">
  <div class="wrap footer-inner">
    <div class="footer-brand"><a href="/"><img src="/img/community/avatar.webp" alt="" width="40" height="40"><strong>${esc(site.name)}</strong></a><span>视觉小说社区</span><p data-site-text="footer.slogan">把故事留在心里，把足迹留在这里。</p></div>
    <nav class="footer-links" aria-label="页脚导航"><div><strong>发现与记录</strong><a href="/games?local=1">作品库</a><a href="/rank">排行榜</a><a href="/collection">群友打卡</a><a href="/lists">列表</a></div><div><strong>创作与活动</strong><a href="/festival/2027/details">拜年祭 · 活动指南</a><a href="/journal">群刊精选</a><a href="/battle">萌战会场</a></div><div><strong>认识我们</strong><a href="/about">关于交流会</a><a href="/me">个人中心</a></div></nav>
    <div class="footer-note"><strong>资料与美术</strong><p>作品资料：<a href="https://www.ymgal.games" target="_blank" rel="noreferrer noopener">月幕</a> / <a href="https://www.cngal.org" target="_blank" rel="noreferrer noopener">CnGal</a> / <a href="https://bgm.tv" target="_blank" rel="noreferrer noopener">Bangumi</a> · 封面、截图与角色资料：<a href="https://vndb.org" target="_blank" rel="noreferrer noopener">VNDB</a>。</p><p>星标及专题美术由交流会提供，群刊保留原作者署名。本站为非商业同人项目，与资料站无隶属或合作关系。</p></div>
  </div>
  <div class="wrap footer-bottom"><span>© ${new Date().getFullYear()} 视觉小说社区 · 视觉小说社区 Galgame 交流会</span><nav aria-label="站点说明"><a href="/install">安装视觉小说社区</a> · <a href="/updates">更新日志 · ${esc(releaseLabel)}</a> · <a href="/policies">用户须知</a> · <a href="/policies/privacy">隐私说明</a> · <a href="/policies/disclaimer">免责声明</a></nav><a href="#main-content">返回页面顶部 ↑</a></div>
</footer>
${pwaControls()}
${!user && ['home','games','music','rank','collection','festival','journal','about','shop','annual','pilgrimage','birthdays','battle'].includes(active) ? guestWelcome() : ''}
${siteEditorControls(user)}
<div class="mascot-widget"><button type="button" class="mascot-toggle" aria-expanded="false" aria-controls="mascot-message" aria-label="和星标打个招呼"><img src="/img/community/avatar.webp" alt="" width="48" height="48"><span>星标</span></button><div class="mascot-message" id="mascot-message" hidden><button type="button" class="mascot-close" aria-label="关闭星标提示">×</button><img src="/img/community/laugh-still.webp" data-animated="/img/community/laugh.gif" alt="星标笑着指向你" width="500" height="500"><p data-mascot-quip>来都来了，留下一点你的故事吧。</p><a href="/games?local=1">去找下一部作品 →</a></div></div>
<script src="${assets.scripts.url}" defer></script>
${subahibi?`<script src="${subahibiScripts.url}" defer></script>`:''}
${shop?`<script src="${shopScripts.url}" defer></script>`:''}
${runtime?`<script src="${runtimeScripts.url}" defer></script>`:''}
</body>
</html>`;
}

export function flashBlock(flash) {
  if (!flash || !flash.message) return '';
  const kind = flash.kind === 'error' ? 'error' : flash.kind === 'ok' ? 'ok' : 'info';
  return `<div class="flash flash-${kind}" role="status">${esc(flash.message)}</div>`;
}

export function scorePill(avg, count) {
  const tone = scoreTone(avg);
  return `<span class="score-pill ${tone}">${esc(fmtScore(avg))}</span>
    <span class="score-count">${count ? `${count} 人评分` : '暂无评分'}</span>`;
}

export function gameCard(game, stats = null) {
  game = withWorkMedia(game);
  const title = game.chineseName || game.name;
  const sub = game.chineseName && game.name && game.name !== game.chineseName ? game.name : '';
  const avg = stats?.avg ?? game.stats?.avg ?? 0;
  const count = stats?.count ?? game.stats?.count ?? 0;
  const img = game.mainImg
    ? `<img class="cover" src="${esc(game.mainImg)}" alt="${esc(title)}" loading="lazy" referrerpolicy="no-referrer">`
    : `<div class="cover cover-empty">${game.media || game.domestic ? '暂无封面' : '正在匹配封面…'}</div>`;
  return `<a class="game-card" data-media-gid="${game.media ? '' : game.gid}" href="/game/${encodeURIComponent(game.gid)}">
    <div class="cover-box">${img}
      <span class="card-score ${scoreTone(avg)}">${esc(fmtScore(avg))}</span>
      ${game.domestic ? '<span class="tag-domestic" title="'+esc(game.domesticSource)+'">国产</span>' : ''}
      ${game.haveChinese ? '<span class="tag tag-cn">'+(game.domestic?'中文':'汉化')+'</span>' : ''}
      ${game.restricted ? '<span class="tag tag-r18">R18</span>' : ''}
    </div>
    <div class="card-body">
      <div class="card-title" title="${esc(title)}">${esc(title)}</div>
      <div class="card-sub" ${sub ? `title="${esc(sub)}"` : 'aria-hidden="true"'}>${esc(sub)}</div>
      <div class="card-meta"><span>${esc(fmtDate(game.releaseDate))}</span></div>
      <div class="card-meta"><span class="muted" data-work-brand>${esc(game.orgName || '品牌资料待补全')}</span></div>
      <div class="card-meta"><span class="muted">${count ? `${count} 人评分 · ${esc(scoreLabel(avg))}` : '还没有人评分'}</span></div>
    </div>
  </a>`;
}

export function gameGrid(games, statsMap = new Map()) {
  if (!games.length) return `<div class="empty">这里还空着，换个关键词试试。</div>`;
  return `<div class="grid">${games.map((g) => gameCard(g, statsMap.get?.(String(g.gid)) || statsMap[String(g.gid)])).join('')}</div>`;
}

export function statCard(label, value, hint = '') {
  return `<div class="stat-card">
    <div class="stat-value">${esc(value)}</div>
    <div class="stat-label">${esc(label)}</div>
    ${hint ? `<div class="stat-hint">${esc(hint)}</div>` : ''}
  </div>`;
}

export function scoreBars(scores) {
  const dist = scoreDistribution(scores);
  const rows = dist
    .slice()
    .reverse()
    .map(
      (d) => `<div class="bar-row">
        <span class="bar-key">${d.score}</span>
        <span class="bar-track"><span class="bar-fill ${scoreTone(d.score)}" style="width:${d.percent}%"></span></span>
        <span class="bar-count">${d.count}</span>
      </div>`,
    )
    .join('');
  return `<div class="bars">${rows}</div>`;
}

export function userLink(user) {
  if (!user) return '<span class="muted">已注销用户</span>';
  return `<a class="user-link" href="/u/${encodeURIComponent(user.username)}">${avatarMarkup(user,24,"member-avatar")}${esc(displayName(user))}</a>`;
}

export function collectionCard({ game, rating, checkin, review, owner = false }) {
  game = withWorkMedia(game);
  const title = game?.chineseName || game?.name || '未知作品';
  const avg = rating?.score || 0;
  return `<div class="collection-item">
    <a class="cover-box cover-sm" href="/game/${encodeURIComponent(game?.gid ?? '')}">
      ${game?.mainImg ? `<img class="cover" src="${esc(game.mainImg)}" alt="${esc(title)}" loading="lazy" referrerpolicy="no-referrer">` : '<div class="cover cover-empty">无封面</div>'}
    </a>
    <div class="collection-body">
      <a class="collection-title" href="/game/${encodeURIComponent(game?.gid ?? '')}">${esc(title)}</a>
      <div class="collection-meta">
        ${avg ? `<span class="mini-score ${scoreTone(avg)}">${avg} 分 · ${esc(scoreLabel(avg))}</span>` : '<span class="muted">未评分</span>'}
        ${checkin ? `<span class="chip chip-${esc(checkin.status)}">${esc(statusLabel(checkin.status))}</span>` : ''}
        ${rating?.updatedAt ? `<span class="muted">评于 ${esc(fromNow(rating.updatedAt))}</span>` : ''}
      </div>
      ${review?.content ? `<p class="collection-review">${renderReviewText(review.content.slice(0, 140))}${review.content.length > 140 ? '…' : ''}</p>` : ''}
    </div>
  </div>`;
}

export function statusLabel(status) {
  return (
    {
      wish: '想玩',
      doing: '在玩',
      done: '玩过',
      dropped: '弃坑',
      version: '进度',
    }[status] || status || '—'
  );
}

export function activityRow({ kind, user, game, data, at }) {
  const title = game?.chineseName || game?.name || '未知作品';
  const link = `<a href="/game/${encodeURIComponent(game?.gid ?? '')}">${esc(title)}</a>`;
  let text = '';
  if (kind === 'rating') text = `给 ${link} 打了 <strong class="${scoreTone(data)}">${data}</strong> 分`;
  else if (kind === 'review') text = `评价了 ${link}`;
  else if (kind === 'checkin') text = `把 ${link} 标记为 <span class="chip chip-${esc(data)}">${esc(statusLabel(data))}</span>`;
  return `<li class="activity"><span class="activity-time">${esc(fromNow(at))}</span>
    <span class="activity-text">${userLink(user)} ${text}</span></li>`;
}

export function pagination(basePath, page, hasNext, total = 0, pageSize = 12) {
  const pages = total && pageSize ? Math.ceil(total / pageSize) : null;
  const prev = page > 1
    ? `<a class="page-btn" href="${basePath}${basePath.includes('?') ? '&' : '?'}page=${page - 1}">上一页</a>`
    : '<span class="page-btn is-disabled">上一页</span>';
  const next = hasNext
    ? `<a class="page-btn" href="${basePath}${basePath.includes('?') ? '&' : '?'}page=${page + 1}">下一页</a>`
    : '<span class="page-btn is-disabled">下一页</span>';
  return `<div class="pager">${prev}<span class="page-info">第 ${page} 页${pages ? ` / 共 ${pages} 页` : ''}</span>${next}</div>`;
}

export function pageHome(data) {
  return homeCommunity(data, gameCard, activityRow);
}

export const pageAnnual = annualPage;
export const pageBattle = battlePage;
export const pageFestival = festivalPage;
export const pageFestivalDetails = festivalDetails;
export const pageJournal = journalPage;
export const pageJournalEntry = journalEntry;
export const pageAbout = aboutPage;

export function pageGames(data) { return catalogPage(data, gameGrid, pagination); }

export function pageGame({
  game,
  stats,
  ratings = [],
  reviews = [],
  myRating = null,
  myReview = null,
  myCheckins = [],
  related = [],
  user,
  workMeta = { jobs: [], currentStatus: '' },
  returnTo = '',
  pilgrimage = '',
  music = '',
  reviewCommunity = null,
  connections = '', appearances = '', offers = '',
}) {
  stats = { avg: 0, count: 0, scores: [], ratings: [], reviewCount: 0, checkinCount: 0, doing: 0, done: 0, ...(stats || {}) };
  game = { ...withWorkMedia(game || {}), characters: game?.characters || [], extensionName: game?.extensionName || [], releases: game?.releases || [], website: game?.website || [] };
  const title = game.chineseName || game.name;
  const aliasList = [
    game.chineseName && game.name && game.chineseName !== game.name ? game.name : '',
    ...(game.extensionName || []).map((e) => e.name),
  ].filter(Boolean);

  const staffRows = (workMeta.jobs || [])
    .map(j => ({ ...j, names: j.names.filter(name => name && !/^(none|null|undefined)$/i.test(name.trim())) }))
    .filter(j => j.names.length)
    .slice(0, 10)
    .map((j) => `<div class="meta-row"><span class="meta-key">${esc(j.job)}</span><span class="meta-val">${esc(j.names.slice(0, 8).join('、'))}</span></div>`)
    .join('');

  const castItem = (c) => `<div class="cast">${c.mainImg ? `<img class="cast-img" src="${esc(c.mainImg)}" alt="${esc(c.name)}" loading="lazy" referrerpolicy="no-referrer">` : '<span class="cast-img cast-img-empty"></span>'}<div class="cast-body"><div class="cast-name">${esc(c.name)}</div>${c.cvName ? `<div class="cast-cv">CV：${esc(c.cvName)}</div>` : ''}</div></div>`;
  game.characters=game.characters.slice().sort((a,b)=>(a.position??2)-(b.position??2)||Number(Boolean(b.mainImg))-Number(Boolean(a.mainImg)));
  const castRows = appearances || game.characters.slice(0, 4).map(castItem).join('') + (game.characters.length > 4 ? `<details class="wd-cast-more"><summary>查看其他 ${game.characters.length - 4} 位角色 ↓</summary><div class="wd-cast-grid">${game.characters.slice(4).map(castItem).join('')}</div></details>` : '');

  const reviewRows = reviews
    .map((r) => {
      const u = r.user || {};
      return `<article class="review" id="review-${esc(r.id)}">
        <header class="review-head">
          ${userLink(u)}
          ${r.score ? `<span class="mini-score ${scoreTone(r.score)}">${r.score} 分</span>` : ''}
          <span class="muted">${esc(fromNow(r.updatedAt || r.createdAt))}</span>
          ${r.mergedHistory ? '<small class="muted">合并前的历史评价 · 原有回复与点赞保留</small>' : ''}${r.title ? `<h3 class="review-title">${esc(r.title)}</h3>` : ''}
        </header>
        <div class="review-body">${renderReviewText(r.content)}</div>
        ${reviewCommunity ? reviewInteractions(r,reviewCommunity.view(r.id,user?.id),user) : ''}
      </article>`;
    })
    .join('');

  const editor = game.identityPending ? '<div class="wd-identity-pending"><p>这份资料与已有档案的对应关系还需核对，暂不开放重复的评分和打卡。原有作品记录不受影响。</p>'+((game.identityCandidates||[]).length?'<p>可以先查看已有档案：</p><ul>'+game.identityCandidates.map(g=>'<li><a href="/game/'+esc(g.gid)+'">'+esc(g.name)+' ↗</a></li>').join('')+'</ul>':'')+'</div>' : user ? recordEditor({ game, rating: myRating, review: myReview, checkin: myCheckins[0], returnTo })+`<a class="wl-work-entry" href="/me/lists/add?gid=${esc(game.gid)}">＋ 加入作品清单</a>` : '';

  const composer = user && !game.identityPending ? reviewEditor({ game, user, review: myReview, returnTo }) : '';

  const releases = (game.releases || []).length
    ? `<section class="panel"><div class="panel-head"><h2>发行版本</h2></div>
        <div class="release-list">${game.releases
          .map(
            (r) => `<div class="release"><span class="release-name">${esc(r.name || '—')}</span>
              <span class="muted">${esc([r.platform, r.language, r.restriction, fmtDate(r.releaseDate)].filter(Boolean).join(' · '))}</span></div>`,
          )
          .join('')}</div></section>`
    : '';

  const websites = (game.website || []).length
    ? `<div class="link-row">${game.website
        .map((w) => `<a class="link-chip" href="${esc(w.link)}" target="_blank" rel="noreferrer noopener">${esc(w.title || w.link)}</a>`)
        .join('')}</div>`
    : '';

  return detailDesign({ game, stats, user, aliasList, staffRows, castRows, reviewRows, editor, composer, returnTo, releases, websites, myCheckins, statusLabel, related, userLink, scoreBars, pilgrimage,connections,offers,music });
}

export const pageRank = rankingPage;

export const pageCollection = communityWall;
export function pageMe(data) { return memberProfile({ ...data, profileUser: data.user, owner: true }); }
export function pageProfile(data) { return memberProfile({ ...data, owner: false }); }

export function pageAuth({ mode, flash, defaultInvite = '', siteOpen = true, next = '' }) {
  return accountDesign({ mode, flashHtml: flashBlock(flash), defaultInvite, siteOpen, next });
}

export function pageAdmin({ invites, stats, importLog, mailReady, canMarkSource = false }) {
  const rows = invites
    .slice()
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
    .map((i) => {
      const usable = i.active !== false && (i.maxUses === null || (i.uses || 0) < i.maxUses);
      return `<tr>
        <td><code class="code">${esc(i.code)}</code></td>
        <td>${esc(i.note || '—')}</td>
        ${canMarkSource ? `<td><form method="post" action="/admin/invite/source" class="sa-source-form"><input type="hidden" name="id" value="${esc(i.id)}">${memberSourcePicker({ source: i.memberSource || '', label: `${i.note || '注册码'}的注册来源` })}<button class="btn btn-sm" type="submit">保存标记</button></form></td>` : ''}
        <td>${usable ? '<span class="chip chip-done">可用</span>' : `<span class="chip chip-dropped">${i.active === false ? '已停用' : '已满额'}</span>`}</td>
        <td>${i.uses || 0}${i.maxUses === null ? ' / ∞' : ` / ${i.maxUses}`}</td>
        <td class="muted">${esc(i.lastUsedAt ? fromNow(i.lastUsedAt) : '—')}</td>
        <td class="muted">${esc(fromNow(i.createdAt))}</td>
        <td>
          <form method="post" action="/admin/invite/toggle" class="inline-form">
            <input type="hidden" name="id" value="${esc(i.id)}">
            <input type="hidden" name="active" value="${i.active === false ? '1' : '0'}">
            <button class="btn btn-ghost btn-sm" type="submit">${i.active === false ? '启用' : '停用'}</button>
          </form>
        </td>
      </tr>`;
    })
    .join('');

  return `
<section class="page-head">
  <h1>站长后台</h1>
  <p class="page-hint">注册码管理、作品数据导入与活动配置。</p>
  <a class="btn btn-primary" href="/admin/battle">萌战工作台 · 阵容与赛程 →</a>
</section>
<section class="stats-row">
  ${statCard('成员', stats.users)}
  ${statCard('本地作品', stats.games)}
  ${statCard('评分', stats.ratings)}
  ${statCard('评价', stats.reviews)}
</section>

<section class="panel">
  <div class="panel-head"><h2>生成注册码</h2></div>
  <p class="ac-mail-status">注册需验证邮箱。邮件服务：<strong>${mailReady ? '已配置' : '尚未配置'}</strong></p>
  <form method="post" action="/admin/invite" class="inline-form-row">
    <input class="input" name="note" maxlength="60" placeholder="备注，例如：给老王">
    <input class="input" name="code" maxlength="20" placeholder="自定义注册码（留空随机生成）">
    <label class="admin-invite-limit">最多可注册人数<input class="input" name="maxUses" type="number" min="1" max="10000" step="1" value="1" required></label>
    ${canMarkSource ? memberSourcePicker() : ''}
    <button class="btn btn-primary" type="submit">生成</button>
  </form>
</section>

<section class="panel">
  <div class="panel-head"><h2>注册码列表</h2><span class="muted">${invites.length} 张</span></div>
  <div class="table-scroll"><table class="rank-table">
    <thead><tr><th>注册码</th><th>备注</th>${canMarkSource ? '<th>注册来源</th>' : ''}<th>状态</th><th>已用 / 上限</th><th>最近使用</th><th>创建</th><th></th></tr></thead>
    <tbody>${rows || `<tr><td colspan="${canMarkSource ? 8 : 7}" class="muted">暂无</td></tr>`}</tbody>
  </table></div>
  ${canMarkSource ? '<p class="page-hint">来源标记仅在超级管理员的当前成员列表显示，已使用或停用的注册码也可标记。</p>' : ''}
</section>

<section class="panel">
  <div class="panel-head"><h2>从月幕导入作品</h2></div>
  <p class="page-hint">每行一个作品名（原名或中文名均可），最多 20 行；导入会串行请求月幕接口并缓存到本地。</p>
  <form method="post" action="/admin/import">
    <textarea class="input textarea" name="names" rows="8" placeholder="近月少女的礼仪&#10;サクラノ詩&#10;White Album 2"></textarea>
    <div class="form-actions"><button class="btn btn-primary" type="submit">开始导入</button></div>
  </form>
  ${importLog ? `<pre class="log">${esc(importLog)}</pre>` : ''}
</section>`;
}

export function pageError({ status, message }) {
  return `<section class="error-page">
    <h1>${status}</h1>
    <p>${esc(message)}</p>
    <p><a class="btn btn-primary" href="/">回到首页</a></p>
  </section>`;
}
