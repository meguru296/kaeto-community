// Current status, rather than historical activity: finishing a work removes it
// from this shelf immediately. Count each surviving member once per work.
export function playingWorks(db, decorate, sort = 'popular') {
  const members = new Map(db.users.list.map(user => [user.id,user])), activity = new Map();
  for (const record of db.checkins.list) {
    if (record.status !== 'doing' || !members.has(record.userId)) continue;
    let item = activity.get(record.gameId);
    if (!item) activity.set(record.gameId, item = { members: new Map(), at: '' });
    const at = String(record.updatedAt || record.createdAt || '');
    if(!item.members.has(record.userId)||at>item.members.get(record.userId))item.members.set(record.userId,at);
    if (at > item.at) item.at = at;
  }
  return db.games.list.filter(game => activity.has(game.id)).map(game => {
    const item = activity.get(game.id), decorated = decorate(db, game);
    const playingMembers=[...item.members].sort((a,b)=>b[1].localeCompare(a[1])||String(members.get(a[0]).uid).localeCompare(String(members.get(b[0]).uid))).map(([id])=>{const member=members.get(id);return {name:displayName(member),href:publicProfileUrl(member),avatar:avatarFor(member)};});
    return { ...decorated, playingAt: item.at, playingMembers, stats: { ...decorated.stats, doing: item.members.size } };
  }).sort((a,b) => (sort === 'recent' ? b.playingAt.localeCompare(a.playingAt) : b.stats.doing - a.stats.doing) || b.playingAt.localeCompare(a.playingAt) || String(a.gid).localeCompare(String(b.gid)));
}
import {displayName,publicProfileUrl} from './identity.js';
import {avatarFor} from './avatars.js';
