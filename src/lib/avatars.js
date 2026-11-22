import { esc } from './utils.js';

export const avatars = [{ id: 'default', label: '默认头像', url: '/img/community/member-avatar.webp' }];
export const avatarFor = user => (avatars.find(a => a.id === user?.avatarId) || avatars[0]).url;
export const validAvatar = id => avatars.some(a => a.id === id);
export function avatarMarkup(user, size=32, className='', alt='') {
  const verified=Number(user?.uid)===10000 && user?.isSuperAdmin===true && user?.isAdmin===true;
  return `<span class="av-badge-wrap" style="--av-size:${size}px"><img class="${esc(className)}" src="${avatarFor(user)}" alt="${esc(alt)}" width="${size}" height="${size}">${verified ? '<span class="av-gold-v" role="img" aria-label="视觉小说社区站长认证" title="视觉小说社区站长认证">V</span>' : ''}</span>`;
}

export function avatarPicker(user) {
  const current = avatars.find(a => a.id === user.avatarId) || avatars[0];
  return `<dialog class="av-dialog" aria-labelledby="avatar-title"><form method="post" action="/api/avatar"><input type="hidden" name="redirect" value="/me"><header><div><p>YOUR LITTLE SIGNATURE</p><h2 id="avatar-title">选一个喜欢的头像</h2></div><button type="button" data-avatar-close aria-label="关闭头像选择">×</button></header><div class="av-preview"><img src="${current.url}" alt="所选头像预览" width="80" height="80" data-avatar-preview><div><strong data-avatar-name>${esc(current.label)}</strong><p>默认头像保留，随时可以换回来。</p></div></div><fieldset class="av-options"><legend class="sr-only">选择头像</legend>${avatars.map(a => `<label><input type="radio" name="avatarId" value="${a.id}" ${current.id === a.id ? 'checked' : ''} data-avatar-url="${a.url}" data-avatar-label="${esc(a.label)}"><span><img src="${a.url}" alt="" width="76" height="76"><small>${esc(a.label)}</small><i aria-hidden="true">✓</i></span></label>`).join('')}</fieldset><footer><button type="button" class="btn" data-avatar-close>取消</button><button class="btn btn-primary" type="submit">保存头像 →</button></footer></form></dialog>`;
}
