import { boundedText } from './external-response.js';
import { StoryCharacterPortraits } from './story-character-portraits.js';

export const storyCharacterSources = { bangumi: 'Bangumi', cngal: 'CnGal', vndb: 'VNDB' };
const sources = Object.keys(storyCharacterSources);
const pageLimit = 50;
const requestSize = 1024 * 1024;
const fault = (message, status = 503) => Object.assign(new Error(message), { status });
const text = (value, max = 160) => typeof value === 'string'
  ? value.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, max) : '';

export function storyCharacterRef(value) {
  if (Number.isSafeInteger(value)) value = 'bgm-character-' + value;
  if (typeof value !== 'string') return null;
  const match = /^(bgm-character-|cngal-|vndb-c)([1-9]\d{0,8})$/.exec(value);
  if (!match) return null;
  const source = { 'bgm-character-': 'bangumi', 'cngal-': 'cngal', 'vndb-c': 'vndb' }[match[1]];
  return { id: value, source, number: Number(match[2]) };
}

export function storyCharacterView(ref, character) {
  const links = {
    bangumi: 'https://bgm.tv/character/',
    cngal: 'https://www.cngal.org/entries/index/',
    vndb: 'https://vndb.org/c',
  };
  return {
    id: ref.id,
    ...(ref.source === 'bangumi' ? { bangumiId: ref.number } : {}),
    name: character.name,
    original: character.original || '',
    work: character.work || '',
    provider: storyCharacterSources[ref.source],
    source: links[ref.source] + ref.number,
    image: (character.hasImage ?? Boolean(character.image))
      ? '/api/me/story-card/character-image/' + (ref.source === 'bangumi' ? ref.number : ref.id)
      : '',
  };
}

function vndbImage(input) {
  return typeof input === 'string' && /^https:\/\/t\.vndb\.org\/ch\/\d+\/\d+\.(?:jpe?g|png|webp)$/.test(input)
    ? input : '';
}

function cngalImage(input, unwrap = true) {
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash) return '';
    if (/^tucang\.cngal\.(?:top|com)$/.test(url.hostname)) {
      return unwrap && /^\/api\/image\/show\/[a-f0-9]+$/.test(url.pathname)
        ? cngalImage(url.search.slice(1), false) : '';
    }
    if (url.hostname === 'image.cngal.org' && !url.search &&
        /^\/(?:images|upload)\/[a-z0-9/_-]+\.(?:jpe?g|png|webp|gif)$/i.test(url.pathname)) return url.href;
  } catch {}
  return '';
}

function joinedWorks(values) {
  return [...new Set(values.map(value => text(value)).filter(Boolean))].slice(0, 2).join(' / ');
}

function cngalCharacter(row) {
  const ref = storyCharacterRef('cngal-' + row?.id);
  const name = text(row?.name);
  if (!ref || row.type !== 'Role' || row.isHidden === true || !name) return null;
  const related = Array.isArray(row.entryRelevances) ? row.entryRelevances : [];
  const info = Array.isArray(row.addInfors) ? row.addInfors : [];
  const listed = info.find(item => item?.modifier === '登场游戏')?.contents;
  const works = related.filter(item => item?.type === 'Game').map(item => item.name);
  if (!works.length && Array.isArray(listed)) works.push(...listed.map(item => item?.displayName));
  return {
    id: ref.id,
    name,
    original: text(row.anotherName),
    work: joinedWorks(works),
    image: cngalImage(row.thumbnail) || cngalImage(row.mainImage) || cngalImage(row.mainPicture),
    sensitive: true,
  };
}

function vndbCharacter(row) {
  const ref = storyCharacterRef('vndb-' + row?.id);
  const original = text(row?.name);
  const name = text(row?.original) || original;
  if (!ref || !name) return null;
  const ratings = [row.image?.sexual, row.image?.violence];
  const classified = ratings.every(rating => typeof rating === 'number' && rating >= 0 && rating <= 2);
  const works = Array.isArray(row.vns) ? row.vns.filter(item => item?.spoiler === 0) : [];
  const primary = works.filter(item => item.role === 'main' || item.role === 'primary');
  return {
    id: ref.id,
    name,
    original,
    work: joinedWorks((primary.length ? primary : works).map(item => item.title)),
    image: vndbImage(row.image?.url),
    sensitive: !classified || ratings.some(rating => rating >= 1),
    maskOnly: !classified || ratings.some(rating => rating >= 1.5),
  };
}

function vndbQuery(filters, page, results, sort) {
  return { filters, page, results, sort, fields: 'name,original,image{url,sexual,violence},vns{title,role,spoiler}' };
}

const endpoints = {
  cngal: {
    interval: 500,
    normalise: cngalCharacter,
    search(query, page) {
      return ['https://api.cngal.org/api/home/Search?' + new URLSearchParams({ Types: 'Role', Text: query, Page: page })];
    },
    searchResult(data, page) {
      const { data: items, totalCount, totalPages } = data?.pagedResultDto || {};
      if (!Array.isArray(items) || !Number.isSafeInteger(totalCount) || totalCount < 0 ||
          !Number.isSafeInteger(totalPages) || totalPages < 0) return null;
      return { items: items.slice(0, 10).map(item => item?.entry), total: totalCount, hasNext: page < totalPages };
    },
    detail(number) {
      return ['https://api.cngal.org/api/entries/GetEntryView/' + number + '?renderMarkdown=false'];
    },
    detailResult: data => data,
  },
  vndb: {
    interval: 1750,
    normalise: vndbCharacter,
    search(query, page) {
      return ['https://api.vndb.org/kana/character', vndbQuery(['search', '=', query], page, 10, 'searchrank')];
    },
    searchResult(data) {
      if (!Array.isArray(data?.results) || typeof data.more !== 'boolean') return null;
      return { items: data.results.slice(0, 10), total: null, hasNext: data.more };
    },
    detail(number) {
      return ['https://api.vndb.org/kana/character', vndbQuery(['id', '=', 'c' + number], 1, 1, 'id')];
    },
    detailResult: data => data?.results?.[0],
  },
};

class CharacterSource {
  constructor(key, fetcher, clock) {
    this.label = storyCharacterSources[key];
    this.api = { ...endpoints[key] };
    this.fetcher = fetcher;
    this.clock = clock;
    this.characters = new Map();
    this.searches = new Map();
    this.pending = new Map();
    this.queue = Promise.resolve();
    this.last = -Infinity;
    this.cooldown = 0;
  }

  cached(map, key, ttl) {
    const entry = map.get(key);
    return entry && this.clock() - entry.at < ttl ? entry.value : undefined;
  }

  remember(map, key, value, limit) {
    map.delete(key);
    map.set(key, { value, at: this.clock() });
    if (map.size > limit) map.delete(map.keys().next().value);
    return value;
  }

  async request(key, query) {
    if (this.pending.has(key)) return this.pending.get(key);
    if (this.pending.size >= 10 || this.clock() < this.cooldown) throw fault(this.label + ' 请求较多，请稍后再试', 429);
    const queuedAt = this.clock();
    const task = this.queue.then(async () => {
      const wait = Math.max(0, this.api.interval + this.last - this.clock());
      if (this.clock() < this.cooldown || this.clock() - queuedAt + wait > 4000) {
        throw fault(this.label + ' 请求较多，请稍后再试', 429);
      }
      if (wait) await new Promise(resolve => setTimeout(resolve, wait));
      this.last = this.clock();
      const [url, body] = query;
      try {
        const response = await this.fetcher(url, {
          method: body ? 'POST' : 'GET',
          headers: {
            Accept: 'application/json',
            'User-Agent': 'KaetoSite (https://github.com/meguru296/kaeto-community; story-card characters)',
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          body: body && JSON.stringify(body),
          redirect: 'error',
          signal: AbortSignal.timeout(5500),
        });
        if (!response.ok) {
          await response.body?.cancel();
          if (response.status === 429) {
            const retry = Number(response.headers.get('retry-after')) * 1000 || 60000;
            this.cooldown = this.clock() + Math.max(60000, Math.min(300000, retry));
            throw fault(this.label + ' 请求较多，请稍后再试', 429);
          }
          if (response.status === 404 && key.startsWith('detail:')) throw fault('角色资料不存在', 404);
          throw fault(this.label + ' 角色资料暂不可用');
        }
        return JSON.parse(await boundedText(response, requestSize));
      } catch (error) {
        if (error.status) throw error;
        throw fault(this.label + ' 角色查询暂时失败');
      }
    });
    this.pending.set(key, task);
    this.queue = task.catch(() => {});
    try { return await task; } finally { this.pending.delete(key); }
  }

  knownCharacter(id) {
    return this.cached(this.characters, id, 3600000);
  }

  async search(query, page) {
    const key = 'search:' + query.toLowerCase() + '|' + page;
    const cached = this.cached(this.searches, key, 600000);
    if (cached) return cached;
    const data = await this.request(key, this.api.search(query, page));
    const result = this.api.searchResult(data, page);
    if (!result) throw fault(this.label + ' 角色搜索格式发生变化');
    const rows = new Map();
    for (const item of result.items) {
      const row = this.api.normalise(item);
      if (!row || rows.has(row.id)) continue;
      const previous = this.knownCharacter(row.id);
      row.original ||= previous?.original || '';
      row.work ||= previous?.work || '';
      this.remember(this.characters, row.id, row, 600);
      rows.set(row.id, storyCharacterView(storyCharacterRef(row.id), row));
    }
    if (result.items.length && !rows.size && result.items.some(item => item?.isHidden !== true)) {
      throw fault(this.label + ' 角色搜索格式发生变化');
    }
    return this.remember(this.searches, key, {
      rows: [...rows.values()], page, hasNext: page < pageLimit && result.hasNext, total: result.total,
    }, 120);
  }

  async character(ref) {
    const cached = this.knownCharacter(ref.id);
    if (cached) return cached;
    const data = await this.request('detail:' + ref.id, this.api.detail(ref.number));
    const row = this.api.normalise(this.api.detailResult(data));
    if (row?.id !== ref.id) throw fault('角色资料不存在', 404);
    return this.remember(this.characters, ref.id, row, 600);
  }
}

export class StoryCharacters {
  constructor(bangumi, { fetcher = fetch, imageFetcher = fetch, clock = Date.now } = {}) {
    this.bangumi = bangumi;
    this.cngal = new CharacterSource('cngal', fetcher, clock);
    this.vndb = new CharacterSource('vndb', fetcher, clock);
    this.portraits = new StoryCharacterPortraits(imageFetcher);
  }

  async search(query, page, source) {
    const q = text(query, 80).normalize('NFKC');
    if (!q) throw fault('请先输入角色名称', 400);
    if (!Number.isSafeInteger(page) || page < 1 || page > pageLimit) throw fault('页码无效', 400);
    if (source !== 'all') {
      if (!sources.includes(source)) throw fault('角色来源无效', 400);
      return this[source].search(q, page);
    }
    const settled = await Promise.allSettled(sources.map(key => this[key].search(q, page)));
    const results = settled.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
    if (!results.length) throw fault('角色资料暂不可用，已选角色已保留');
    const rows = [];
    for (let i = 0; i < Math.max(...results.map(result => result.rows.length)); i++) {
      for (const result of results) if (result.rows[i]) rows.push(result.rows[i]);
    }
    return {
      rows, page, hasNext: results.some(result => result.hasNext), total: null,
      unavailable: sources.filter((_, index) => settled[index].status === 'rejected').map(key => storyCharacterSources[key]),
    };
  }

  knownCharacter(ref) {
    return ref.source === 'bangumi'
      ? this.bangumi.knownCharacter(ref.number) : this[ref.source].knownCharacter(ref.id);
  }

  character(ref, options) {
    return ref.source === 'bangumi'
      ? this.bangumi.character(ref.number, options) : this[ref.source].character(ref);
  }

  async image(ref, showOriginal) {
    if (ref.source === 'bangumi') return this.bangumi.image(ref.number, showOriginal);
    return this.portraits.get(await this.character(ref), showOriginal);
  }

  async stop() {
    await Promise.allSettled([
      this.bangumi.stop(), this.cngal.queue, this.vndb.queue, this.portraits.stop(),
    ]);
  }
}
