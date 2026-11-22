import { recordsFor } from './records.js';
import { displayName } from './identity.js';
import { avatarFor } from './avatars.js';
import { workKey } from './work-key.js';
import { newId } from './utils.js';
import { levelFor } from './member-levels.js';
import { storyCharacterRef, storyCharacterView } from './story-characters.js';

export const storyWorkSlots = {
  favorite: '最爱的作品',
  first: '入坑作',
  replay: '最想失忆重玩的作品',
  regret: '最意难平的作品',
  worst: '最烂的作品',
};

export const storyPreferences = {
  genres: '偏好的作品类型',
  traits: '最喜欢的属性',
  brands: '最喜欢的厂商',
  artists: '最喜欢的原画家',
  writers: '最喜欢的剧本家',
  voiceActors: '最喜欢的声优',
  songs: '最喜欢的歌曲',
};

export const storySocials = {
  bilibili: 'B 站',
  xiaohongshu: '小红书',
  x: 'X',
};

export const storyPalettes = {
  pine: { label: '松绿纸白', background: '#f9f7f0', accent: '#16574d' },
  rose: { label: '梅子淡粉', background: '#fdf4f6', accent: '#8b395e' },
  indigo: { label: '雾蓝', background: '#f0f4fa', accent: '#345784' },
  night: { label: '夜蓝浅金', background: '#192533', accent: '#eec794' },
};

const appearanceDefaults = {
  palette: 'pine',
  background: storyPalettes.pine.background,
  accent: storyPalettes.pine.accent,
  font: 'sans',
  weight: 'regular',
  size: 'standard',
};

const dateFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Hong_Kong' });
const countCharacters = value => Array.from(value).length;
const fault = (message, status = 400) => Object.assign(new Error(message), { status });
const clean = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() : '';

export function storyCardWorkOption(game) {
  return {
    gid: String(game.gid),
    title: game.chineseName || game.name || '未命名作品',
    original: game.name || '',
    cover: game.mainImg ? '/api/me/story-card/cover/' + game.gid : '',
  };
}

export function storyCardData(db, user, resolveWork) {
  const saved = user.storyCard;
  const date = dateFormat.format(new Date());
  const registered = new Date(user.joinedAt || user.createdAt || '');
  const works = {};
  for (const [slot, savedWork] of Object.entries(saved?.works || {})) {
    const game = resolveWork(savedWork.gid);
    works[slot] = game ? storyCardWorkOption(game) : { ...savedWork, cover: '' };
  }
  return {
    date,
    currentYear: Number(date.slice(0, 4)),
    avatar: avatarFor(user),
    registeredDate: Number.isFinite(registered.getTime()) ? dateFormat.format(registered) : '',
    level: levelFor(user.progress?.xp || 0).level,
    played: recordsFor(db, user.id).filter(record => ['done', 'doing'].includes(record.checkin?.status)).length,
    revision: saved?.revision || '',
    savedAt: saved?.savedAt || '',
    draft: {
      name: saved?.name ?? Array.from(displayName(user)).slice(0, 32).join(''),
      startYear: saved?.startYear ?? null,
      note: saved?.note || '',
      socials: saved?.socials || {},
      appearance: { ...appearanceDefaults, ...saved?.appearance },
      preferences: saved?.preferences || {},
      characters: (saved?.characters || []).flatMap(character => {
        const ref = storyCharacterRef(character.id ?? character.bangumiId);
        return ref ? [storyCharacterView(ref, character)] : [];
      }),
      works,
    },
  };
}

export function validateStoryDraft(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw fault('资历卡资料格式不正确');
  const name = clean(input.name);
  const note = clean(input.note);
  if (!name || countCharacters(name) > 32) throw fault('请填写 1—32 字的姓名（ID / CN）');
  if (countCharacters(note) > 50) throw fault('想说的一句话最多 50 字');
  const startYear = input.startYear ?? null;
  const currentYear = Number(dateFormat.format(new Date()).slice(0, 4));
  if (startYear !== null && (!Number.isInteger(startYear) || startYear < 1980 || startYear > currentYear)) {
    throw fault('入坑年份请选择 1980—' + currentYear + ' 年');
  }
  const socials = {};
  for (const [platform, label] of Object.entries(storySocials)) {
    const value = clean(input.socials?.[platform]).replace(/^[@＠]+\s*/, '');
    if (countCharacters(value) > 48) throw fault(label + '账号最多 48 字');
    if (value) socials[platform] = value;
  }
  const appearance = {
    palette: input.appearance?.palette ?? appearanceDefaults.palette,
    background: input.appearance?.background ?? appearanceDefaults.background,
    accent: input.appearance?.accent ?? appearanceDefaults.accent,
    font: input.appearance?.font ?? appearanceDefaults.font,
    weight: input.appearance?.weight ?? appearanceDefaults.weight,
    size: input.appearance?.size ?? appearanceDefaults.size,
  };
  if (typeof appearance.palette !== 'string' ||
      !(appearance.palette === 'custom' || Object.hasOwn(storyPalettes, appearance.palette)) ||
      !['sans', 'serif'].includes(appearance.font) ||
      !['light', 'regular', 'bold'].includes(appearance.weight) ||
      !['compact', 'standard', 'large'].includes(appearance.size)) throw fault('请选择有效的资历卡外观');
  for (const field of ['background', 'accent']) {
    if (typeof appearance[field] !== 'string' || !/^#[0-9a-f]{6}$/i.test(appearance[field])) throw fault('请选择有效的颜色');
    appearance[field] = appearance[field].toLowerCase();
  }

  const preferences = {};
  for (const [key, label] of Object.entries(storyPreferences)) {
    const values = input.preferences?.[key] ?? [];
    if (!Array.isArray(values) || values.length > 5 || values.some(value => typeof value !== 'string' || countCharacters(clean(value)) > 60)) {
      throw fault(label + '最多填写 5 项，每项最多 60 字');
    }
    const seen = new Set();
    preferences[key] = values.map(clean).filter(value => {
      const normalized = value.normalize('NFKC').toLowerCase();
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
  }

  if (!Array.isArray(input.characters) || input.characters.length > 10) throw fault('最多选择 10 位角色');
  const characters = input.characters.map(storyCharacterRef);
  if (characters.some(ref => !ref)) throw fault('请选择有效的角色');
  const works = {};
  for (const slot of Object.keys(storyWorkSlots)) {
    const gid = input.works?.[slot];
    if (gid == null || gid === '') continue;
    if (typeof gid !== 'string' || !workKey(gid)) throw fault('请从作品库里选择作品');
    works[slot] = gid;
  }
  return { name, note, startYear, socials, appearance, preferences, characters: [...new Set(characters.map(ref => ref.id))], works };
}

export async function saveStoryCard(db, userId, input, { resolveWork, resolveCharacter }) {
  const draft = validateStoryDraft(input);
  const user = db.users.get(userId);
  const saved = user?.storyCard;
  const revision = saved?.revision || '';
  if (!user) throw fault('请先登录', 401);
  if (input.revision !== revision) throw fault('另一窗口已保存更新的资历卡，请重新打开后再编辑', 409);

  const works = {};
  for (const [slot, gid] of Object.entries(draft.works)) {
    const game = resolveWork(gid);
    const previous = saved?.works?.[slot];
    if (!game && previous?.gid !== gid) throw fault('「' + storyWorkSlots[slot] + '」已在作品库中不可用，请重新选择');
    works[slot] = game ? { gid: String(game.gid), title: storyCardWorkOption(game).title } : previous;
  }

  const previousCharacters = new Map(saved?.characters?.flatMap(character => {
    const ref = storyCharacterRef(character.id ?? character.bangumiId);
    return ref ? [[ref.id, character]] : [];
  }));
  const characters = await Promise.all(draft.characters.map(async id => {
    const previous = previousCharacters.get(id);
    if (previous) return previous;
    const ref = storyCharacterRef(id);
    const character = await resolveCharacter(ref);
    return {
      id, ...(ref.source === 'bangumi' ? { bangumiId: ref.number } : {}),
      name: character.name, original: character.original,
      work: character.work || '', hasImage: Boolean(character.image),
    };
  }));

  // The upstream lookup can yield to another save. Check the revision again
  // immediately before updating the account.
  if ((db.users.get(userId)?.storyCard?.revision || '') !== revision) {
    throw fault('另一窗口已保存更新的资历卡，请重新打开后再编辑', 409);
  }
  const storyCard = { ...draft, works, characters, revision: newId(), savedAt: new Date().toISOString() };
  try {
    if (!await db.users.update(userId, { storyCard })) throw fault('请先登录', 401);
  } catch (error) {
    if (db.users.get(userId)?.storyCard === storyCard) db.users.get(userId).storyCard = saved;
    throw error;
  }
  return storyCard;
}
