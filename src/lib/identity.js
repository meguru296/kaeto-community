export const displayName = user => user?.nickname?.trim() || user?.username || '群友';
export const publicProfileUrl = user => Number.isSafeInteger(Number(user?.uid)) && Number(user.uid)>0 ? '/me/'+Number(user.uid) : '/u/'+encodeURIComponent(user?.username||'');

export function profilePatch(form) {
  const patch = {};
  if (Object.hasOwn(form, 'nickname')) {
    const nickname = String(form.nickname || '').trim();
    if ([...nickname].length > 20 || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(nickname)) throw new Error('昵称最多 20 字，请勿包含换行或控制字符');
    patch.nickname = nickname;
  }
  if (Object.hasOwn(form, 'bio')) {
    const bio = String(form.bio || '').trim();
    if ([...bio].length > 120) throw new Error('个人简介最多 120 字');
    patch.bio = bio;
  }
  return patch;
}
