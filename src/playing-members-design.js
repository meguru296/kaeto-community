import {esc} from './lib/utils.js';
export function playingMembers(game){
  const rows=game.playingMembers||[];
  if(!rows.length)return '';
  const member=m=>`<a class="playing-member" href="${esc(m.href)}"><img src="${esc(m.avatar)}" width="24" height="24" alt="" loading="lazy"><span>${esc(m.name)}</span></a>`;
  return `<div class="playing-members" aria-label="正在玩这部作品的群友"><p class="dt-playing-note">● ${rows.length} 位群友在玩</p><div class="playing-member-list">${rows.slice(0,3).map(member).join('')}</div>${rows.length>3?`<details class="playing-member-more"><summary>还有 ${rows.length-3} 位群友</summary><div class="playing-member-list">${rows.slice(3).map(member).join('')}</div></details>`:''}</div>`;
}
