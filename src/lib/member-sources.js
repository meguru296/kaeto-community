export const MEMBER_SOURCES = ['', '视觉小说社区', '纺星'];
export const CUSTOM_MEMBER_SOURCE = '__custom__';
export const INVITE_MEMBER_SOURCE = '__invite__';
export const MEMBER_SOURCE_MAX = 24;

export function normalizeMemberSource(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if ([...text].length > MEMBER_SOURCE_MAX || /[\u0000-\u001f\u007f-\u009f<>]/u.test(text) || [CUSTOM_MEMBER_SOURCE, INVITE_MEMBER_SOURCE].includes(text)) return null;
  return text;
}

export function submittedMemberSource(choice, custom) {
  if (choice !== CUSTOM_MEMBER_SOURCE) return choice;
  const text = normalizeMemberSource(custom);
  // Empty custom text is an error, distinct from explicitly choosing 未标记.
  return text || null;
}

// Provenance remains private. Only the super-admin member list renders it.
export function memberSourceLabels(db) {
  const byInvite = new Map();
  const byMember = new Map();
  for (const invite of db.invites.all()) {
    const source = normalizeMemberSource(invite.memberSource) || '';
    if (!source) continue;
    byInvite.set(invite.id, source);
    const usedBy = Array.isArray(invite.usedBy) ? invite.usedBy : typeof invite.usedBy === 'string' ? [invite.usedBy] : [];
    for (const id of usedBy) {
      const labels = byMember.get(id) || new Set(); labels.add(source); byMember.set(id, labels);
    }
  }
  return new Map(db.users.all().map(user => {
    const saved = byInvite.get(user.registrationInviteId);
    const labels = byMember.get(user.id);
    const override = normalizeMemberSource(user.registrationSource);
    return [user.id, override !== null ? override || '未标记' : saved || (labels?.size === 1 ? [...labels][0] : labels?.size > 1 ? '来源待核验' : '未标记')];
  }));
}
