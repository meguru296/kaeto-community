import { esc, fmtDate } from './lib/utils.js';
import { contentFields, isSuperAdmin } from './lib/site-content.js';
import { maskedEmail } from './lib/email-verification.js';
import { displayName } from './lib/identity.js';
import { memberSourceLabels, INVITE_MEMBER_SOURCE, normalizeMemberSource } from './lib/member-sources.js';
import { memberSourcePicker } from './member-source-design.js';

export function siteEditorControls(user) {
  if (!isSuperAdmin(user)) return '';
  return `<div class="site-edit-bar"><span>超级管理员</span><button type="button" data-toggle-site-edit aria-pressed="false">开启页面编辑</button><a href="/admin/site">素材与内容</a><a href="/admin/users">成员管理</a><a href="/admin/runtime">运行状态</a></div><dialog class="site-edit-dialog"><form method="post" action="/admin/site/content"><header><strong data-edit-label>编辑内容</strong><button type="button" data-close-site-edit aria-label="关闭编辑">×</button></header><input type="hidden" name="key"><input type="hidden" name="redirect"><label>内容<textarea class="input" name="value" rows="4" required></textarea></label><p>只保存纯文本或本站图片路径。图片可先在素材管理中上传。</p><footer><button class="btn" name="reset" value="1" formnovalidate>恢复原始内容</button><button class="btn btn-primary">保存修改</button></footer></form></dialog>`;
}

export function contentAdmin({ content, assets, audit }) {
  const values = content.values();
  return `<header class="sa-heading"><p class="dt-label">SUPER ADMIN / CONTENT STUDIO</p><h1>内容与素材工作台</h1><p>页面上开启编辑后，可直接点击带边框的文案和图片。留空前请确认效果，也可以恢复原始内容。</p><nav><a href="/">首页编辑 ↗</a><a href="/about#gallery">画廊编辑 ↗</a><a href="/festival/2027">拜年祭 ↗</a><a href="/admin/battle">萌战设置 ↗</a><a href="/admin/users">成员管理 ↗</a><a href="/admin/runtime">运行状态 ↗</a><a href="/admin">返回后台</a></nav></header><section class="panel"><h2>上传图片</h2><form method="post" action="/admin/site/upload" enctype="multipart/form-data"><label>PNG / JPEG / WebP / GIF · 最多 5MB<input class="input" type="file" name="image" accept="image/png,image/jpeg,image/webp,image/gif" required></label><button class="btn btn-primary">上传到素材库 →</button></form><p>保留 GIF / WebP 动画；不开放脚本、SVG、任意文件和图片外链抓取。站点素材库总量限 250MB。</p><div class="sa-assets">${assets.map(a => `<article><img src="${esc(a.url)}" alt="已上传素材" loading="lazy"><code>${esc(a.url)}</code><button type="button" data-copy-asset="${esc(a.url)}">复制路径</button></article>`).join('') || '<p>还没有上传素材。</p>'}</div></section><section class="panel"><h2>已开放的编辑区域</h2><div class="sa-fields">${contentFields.map(([key, label, kind, max]) => `<form method="post" action="/admin/site/content"><input type="hidden" name="key" value="${key}"><input type="hidden" name="redirect" value="/admin/site"><label>${esc(label)}${kind === 'text' ? `<textarea class="input" name="value" maxlength="${max}" rows="2" placeholder="未覆盖时使用原始内容">${esc(values[key] ?? '')}</textarea>` : kind === 'bilibili' ? `<input class="input" type="url" name="value" maxlength="500" value="${esc(values[key] ?? '')}" placeholder="https://www.bilibili.com/video/BV…"><small>填入视频页或 b23.tv 分享链接；留空隐藏观看按钮。</small>` : `<input class="input" name="value" value="${esc(values[key] ?? '')}" placeholder="/img/uploads/… 或 /img/community/…">`}</label><footer><button class="btn btn-sm">保存</button><button class="btn btn-ghost btn-sm" name="reset" value="1">恢复原始</button></footer></form>`).join('')}</div></section><section class="panel"><h2>最近的内容修改</h2><p>记录修改者、时间和修改前后内容，数据备份会一并保留。</p><div class="sa-audit">${audit.map(a => `<p><time>${esc(fmtDate(a.createdAt))}</time> <b>${esc(a.action)}</b> <code>${esc(a.key)}</code>${a.before !== undefined ? `<small>${esc(String(a.before ?? '原始内容').slice(0,100))} → ${esc(String(a.after ?? '恢复原始').slice(0,100))}</small>` : ''}</p>`).join('') || '<p>暂无修改记录。</p>'}</div></section>`;
}

const joinClock = new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
export function memberJoinTime(user) {
  const value = user.joinedAt || user.createdAt;
  const precise = stamp => typeof stamp==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(stamp) && /(?:Z|[+-]\d{2}:\d{2})$/.test(stamp) && Number.isFinite(Date.parse(stamp));
  if(precise(value)) return joinClock.format(new Date(value));
  // A migration's creation time must not be mistaken for the join time.
  if(/^\d{4}-\d{2}-\d{2}$/.test(value || '')) {
    if(precise(user.createdAt) && joinClock.format(new Date(user.createdAt)).startsWith(value)) return joinClock.format(new Date(user.createdAt));
    return value+'（仅有日期）';
  }
  return '未记录';
}
export function usersAdmin(db) {
  const users = db.users.all().slice().sort((a,b) => a.uid - b.uid);
  const sources = memberSourceLabels(db);
  const rows = users.map(u => {
    const source = sources.get(u.id), override = normalizeMemberSource(u.registrationSource);
    const badge = source === '纺星' ? ' sa-source-fangxing' : source === '视觉小说社区' ? ' sa-source-xuantang' : '';
    return `<tr><td data-label="UID">${u.uid}</td><td data-label="登录用户名">${esc(u.username)}</td><td data-label="昵称">${esc(displayName(u))}</td><td data-label="邮箱">${u.emailVerifiedAt ? esc(maskedEmail(u.email)) + ' · 已验证' : '未绑定'}</td><td data-label="权限">${isSuperAdmin(u) ? '超级管理员' : u.isAdmin ? '管理员' : '成员'}</td><td data-label="注册来源"><div class="sa-member-source"><span class="sa-source-badge${badge}">${esc(source)}</span><button type="button" class="sa-source-edit" data-member-source="${esc(u.id)}" data-source="${esc(override === null ? INVITE_MEMBER_SOURCE : override)}" data-member-name="${esc(displayName(u))}" aria-label="编辑 ${esc(displayName(u))} 的注册来源">编辑</button></div></td><td data-label="加入时间"><time class="sa-member-time">${esc(memberJoinTime(u))}</time></td></tr>`;
  }).join('');
  return `<header class="sa-heading"><p class="dt-label">SUPER ADMIN / MEMBERS</p><h1>当前成员 · ${users.length} 人</h1><p>UID 为公开编号；作品记录、头像、应援和会话通过内部 ID 关联，重排 UID 不会拆散记录。邮箱只在这里脱敏显示。</p><p>注册来源可逐人编辑，支持自定义文字；修改仅影响该成员，也可恢复为按注册码来源显示。</p><nav><a href="/admin/site">内容工作台</a><a href="/admin">后台首页</a></nav></header><div class="table-scroll panel"><table class="table sa-member-table"><thead><tr><th>UID</th><th>登录用户名</th><th>昵称</th><th>邮箱</th><th>权限</th><th>注册来源</th><th>加入时间（北京时间）</th></tr></thead><tbody>${rows}</tbody></table></div><dialog class="sa-source-dialog" aria-labelledby="sa-source-title"><form method="post" action="/admin/users/source"><header><h2 id="sa-source-title">编辑注册来源</h2><button type="button" data-source-close aria-label="关闭注册来源编辑">×</button></header><p data-source-member></p><input type="hidden" name="id">${memberSourcePicker({ source: null, allowInvite: true })}<p class="sa-source-note">仅超级管理员可见，不改变其他成员或注册码的来源。</p><footer><button class="btn btn-ghost" type="button" data-source-close>取消</button><button class="btn btn-primary" type="submit">保存来源</button></footer></form></dialog><p>删除成员属于数据管理操作，本页不提供误触即可删除的按钮。请先备份，再使用明确指定成员的维护脚本。</p>`;
}
