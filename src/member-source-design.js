import { esc } from './lib/utils.js';
import { MEMBER_SOURCES, CUSTOM_MEMBER_SOURCE, INVITE_MEMBER_SOURCE, MEMBER_SOURCE_MAX, normalizeMemberSource } from './lib/member-sources.js';

export function memberSourcePicker({ source = '', allowInvite = false, label = '注册来源' } = {}) {
  const inherited = allowInvite && (source === null || source === INVITE_MEMBER_SOURCE);
  const text = normalizeMemberSource(source) || '';
  const custom = !inherited && !MEMBER_SOURCES.includes(text);
  const selected = inherited ? INVITE_MEMBER_SOURCE : custom ? CUSTOM_MEMBER_SOURCE : text;
  const options = [...(allowInvite ? [[INVITE_MEMBER_SOURCE, '按注册码来源']] : []), ...MEMBER_SOURCES.map(s => [s, s || '未标记']), [CUSTOM_MEMBER_SOURCE, '自定义']];
  return `<div class="sa-source-picker" data-source-picker><label>${esc(label)}<select class="input" name="memberSource">${options.map(([value, name]) => `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(name)}</option>`).join('')}</select></label><label data-source-custom${custom ? '' : ' hidden'}>自定义来源<input class="input" name="customMemberSource" maxlength="${MEMBER_SOURCE_MAX}" value="${custom ? esc(text) : ''}" placeholder="例如：校外同好会"${custom ? ' required' : ' disabled'}><small>最多 ${MEMBER_SOURCE_MAX} 字，仅后台可见。</small></label></div>`;
}
