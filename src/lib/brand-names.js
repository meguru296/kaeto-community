// Verified bilingual producer alias, not a fuzzy name merge.
export function canonicalBrand(value) {
  const name = String(value || '').trim();
  return name.normalize('NFKC').toLowerCase().replace(/\s+/g, '') === 'ramunegames' ? 'ラムネゲームズ' : name;
}
export const canonicalBrands = value => [...new Set(String(value || '').split(/\s+\/\s+/).map(canonicalBrand).filter(Boolean))].join(' / ');
