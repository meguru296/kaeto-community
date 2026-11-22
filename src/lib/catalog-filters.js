import { withWorkMedia } from './work-media.js';
import { canonicalBrand } from './brand-names.js';
const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
export function writersFor(game) {
  return [...new Set([...(game.staff || []).filter(s => /脚本|剧本|scenario|^script$/i.test(s.job || '')).map(s => s.name), ...(game.media?.writers || [])].filter(n=>n && !/^(none|null|未知)$/i.test(n.trim())))];
}
export function brandsFor(game) {
  return [...new Set([...(game.media?.developers || []), ...String(game.orgName || '').split(/\s+\/\s+/)].map(canonicalBrand).filter(n=>n && !/^(none|null|默认机构|未知)$/i.test(n)))];
}
export function catalogFilters(games, params) {
  const brand = canonicalBrand(String(params.get('brand') || '').trim().slice(0, 80));
  const writer = String(params.get('writer') || '').trim().slice(0, 80);
  const decorated = games.map(withWorkMedia);
  const options = pick => {
    const counts = new Map();
    for (const game of decorated) for (const name of pick(game)) counts.set(name, (counts.get(name) || 0) + 1);
    return [...counts].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0], 'zh-CN')).map(([name,count])=>({name,count}));
  };
  return { brand, writer, brands: options(brandsFor), writers: options(writersFor),
    games: decorated.filter(g => (!brand || brandsFor(g).some(n=>normalize(n)===normalize(brand))) && (!writer || writersFor(g).some(n=>normalize(n)===normalize(writer)))) };
}
