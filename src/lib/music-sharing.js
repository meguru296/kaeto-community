import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { newId, nowIso } from './utils.js';
import { isSuperAdmin } from './site-content.js';

export const musicRoles = { op: 'OP', ed: 'ED', bgm: 'BGM', insert: '插入曲', other: '其他' };
export const musicFault = (message, status = 400) => Object.assign(new Error(message), { status });
export const musicTextLength = value => [...String(value || '').replace(/\[星标:[^\]\n]*\]/g, '').replace(/[\s\p{Cf}]/gu, '')].length;
export const musicRevision = post => createHash('sha256').update(JSON.stringify([post.id,post.updatedAt,post.content,post.work,post.role,post.spoiler])).digest('hex');
export function recommendationText(value) {
  const content = String(value || '').replace(/\r\n?/g, '\n').trim();
  if ([...content].length > 2000) throw musicFault('推荐正文最多 2000 字');
  if (musicTextLength(content) < 50) throw musicFault('请写至少 50 字推荐正文，空白和表情包标记不计入');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(content)) throw musicFault('正文含有无效字符');
  return content;
}
function validate(saved) {
  if (saved?.version !== 1 || !['songs', 'posts', 'likes'].every(k => Array.isArray(saved[k]))) throw Error('音乐分享数据格式无效，原件已保留');
  const ids = new Set(), pairs = new Set();
  for (const song of saved.songs) {
    if (!song || !/^netease-(?:song-[1-9]\d{0,18}|api-[a-f0-9]{32})$/.test(song.id) || typeof song.providerId !== 'string' || !/^(?:[a-fA-F0-9]{32}|[1-9]\d{0,18})$/.test(song.providerId) || typeof song.title !== 'string' || !song.title || song.title.length > 200 || !Array.isArray(song.artists) || song.artists.length > 20 || song.artists.some(a => typeof a !== 'string' || a.length > 120) || typeof song.album !== 'string' || typeof song.cover !== 'string' || song.cover && !/^https:\/\/p\d+\.music\.126\.net\//.test(song.cover) || typeof song.url !== 'string' || song.url && song.url !== 'https://music.163.com/song?id=' + song.sourceId || !Number.isFinite(song.duration) || song.duration < 0 || ids.has(song.id)) throw Error('音乐条目格式无效，原件已保留');
    ids.add(song.id);
  }
  const posts = new Set();
  for (const post of saved.posts) {
    const pair = post.userId + ':' + post.songId;
    if (!post || ! /^[a-f0-9]{24}$/.test(post.id) || typeof post.userId !== 'string' || !ids.has(post.songId) || !post.work || typeof post.work.gid !== 'string' || typeof post.work.title !== 'string' || !Object.hasOwn(musicRoles, post.role) || typeof post.spoiler !== 'boolean' || typeof post.content !== 'string' || musicTextLength(post.content) < 50 || [...post.content].length > 2000 || !Number.isFinite(Date.parse(post.createdAt)) || !Number.isFinite(Date.parse(post.updatedAt)) || posts.has(post.id) || pairs.has(pair)) throw Error('音乐推荐格式无效，原件已保留');
    posts.add(post.id); pairs.add(pair);
  }
  const likes = new Set();
  for (const like of saved.likes) {
    const pair = like.postId + ':' + like.userId;
    if (!like || !posts.has(like.postId) || typeof like.userId !== 'string' || likes.has(pair)) throw Error('音乐点赞格式无效，原件已保留');
    likes.add(pair);
  }
  if (!['replies','notices','likeNotified','endorsements'].every(k => Array.isArray(saved[k]))) throw Error('音乐讨论格式无效，原件已保留');
  const endorsers = new Set();
  for (const vote of saved.endorsements) {
    const pair = vote?.songId + ':' + vote?.userId;
    if (!vote || !ids.has(vote.songId) || typeof vote.userId !== 'string' || !vote.userId || typeof vote.active !== 'boolean' || !Number.isFinite(Date.parse(vote.at)) || endorsers.has(pair)) throw Error('歌曲推荐人数格式无效，原件已保留');
    endorsers.add(pair);
  }
  const replyIds = new Set(), tokens = new Set(), noticeIds = new Set();
  for (const reply of saved.replies) {
    if (!reply || !/^[a-f0-9]{24}$/.test(reply.id) || replyIds.has(reply.id) || !posts.has(reply.postId) || typeof reply.userId !== 'string' || typeof reply.content !== 'string' || reply.spoiler != null && typeof reply.spoiler !== 'boolean' || typeof reply.parentId !== 'string' || !/^[a-f0-9]{24}$/.test(reply.token) || tokens.has(reply.userId+':'+reply.token) || !Number.isFinite(Date.parse(reply.at)) || (reply.deletedAt ? !Number.isFinite(Date.parse(reply.deletedAt)) || reply.content !== '' : musicTextLength(reply.content)<2 || [...reply.content].length>1000)) throw Error('音乐回复格式无效，原件已保留');
    replyIds.add(reply.id); tokens.add(reply.userId+':'+reply.token);
  }
  for (const reply of saved.replies) if (reply.parentId && !saved.replies.some(r=>r.id===reply.parentId && r.postId===reply.postId && r.id!==reply.id)) throw Error('音乐回复关联无效，原件已保留');
  for (const notice of saved.notices) {
    if (!notice || !/^music-[a-f0-9]{24}$/.test(notice.id) || noticeIds.has(notice.id) || !['like','reply'].includes(notice.kind) || !posts.has(notice.postId) || typeof notice.recipientId!=='string' || typeof notice.actorId!=='string' || !Number.isFinite(Date.parse(notice.at)) || notice.readAt && !Number.isFinite(Date.parse(notice.readAt)) || notice.kind==='reply' && !saved.replies.some(r=>r.id===notice.replyId && r.postId===notice.postId)) throw Error('音乐通知格式无效，原件已保留');
    noticeIds.add(notice.id);
  }
  if (saved.likeNotified.some(key=>typeof key!=='string') || new Set(saved.likeNotified).size!==saved.likeNotified.length) throw Error('音乐通知去重格式无效，原件已保留');
  return saved;
}

// One snapshot makes publishing the song and its recommendation atomic in JSON
// and in the existing PostgreSQL kv store. No account collections are changed.
export class MusicSharing {
  constructor(db, { dataDir = db.dataDir, kv = db.kv } = {}) {
    Object.assign(this, { db, dataDir, kv });
    this.state = { version: 1, songs: [], posts: [], likes: [], replies: [], notices: [], likeNotified: [], endorsements: [] };
    this.queue = Promise.resolve(); this.stopping = false;
  }
  async init() {
    let saved;
    try { saved = this.kv ? await this.kv.get('music-sharing.json') : JSON.parse(await fs.readFile(path.join(this.dataDir, 'music-sharing.json'), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw Error('音乐分享数据无法读取，原件已保留'); }
    if (saved != null) {
      // Old snapshots count their existing authors once. Reading never writes a
      // snapshot; the next normal operation persists the compatible extension.
      const endorsements = saved.endorsements === undefined && Array.isArray(saved.posts) ? saved.posts.map(post=>({songId:post.songId,userId:post.userId,at:post.createdAt,active:true})) : saved.endorsements;
      this.state = validate({ replies: [], notices: [], likeNotified: [], ...saved, endorsements });
    }
    return this;
  }
  write(change) {
    if (this.stopping) throw musicFault('音乐分享正在关闭，请稍后再试', 503);
    const run = this.queue.then(async () => {
      const next = structuredClone(this.state), result = change(next);
      validate(next);
      if (this.kv) await this.kv.set('music-sharing.json', next);
      else {
        await fs.mkdir(this.dataDir, { recursive: true });
        const file = path.join(this.dataDir, 'music-sharing.json'), temp = file + '.' + process.pid + '.tmp';
        try { await fs.writeFile(temp, JSON.stringify(next), { mode: 0o600 }); await fs.rename(temp, file); }
        catch (error) { await fs.unlink(temp).catch(() => {}); throw error; }
      }
      this.state = next; return result;
    });
    this.queue = run.catch(() => {}); return run;
  }
  song(id) { return this.state.songs.find(song => song.id === id); }
  worksForSong(id) { return [...new Map(this.state.posts.filter(post => post.songId === id).map(post => [post.work.gid, post.work])).values()]; }
  post(id) { return this.state.posts.find(post => post.id === id); }
  owned(userId, songId) { return this.state.posts.find(post => post.userId === userId && post.songId === songId); }
  recommendationIndex(userId) {
    const counts=new Map();
    for(const vote of this.state.endorsements)if(vote.active){const row=counts.get(vote.songId)||{count:0,recommended:false};row.count++;row.recommended ||= vote.userId===userId;counts.set(vote.songId,row);}
    return counts;
  }
  recommendation(songId, userId) { return this.recommendationIndex(userId).get(songId)||{count:0,recommended:false}; }
  supporters(songId) {
    return this.state.endorsements.filter(v=>v.songId===songId && v.active).sort((a,b)=>b.at.localeCompare(a.at)).map(v=>({member:this.db.users.get(v.userId),at:v.at}));
  }
  async endorse(user, songId, desired) {
    if (!user) throw musicFault('请先登录再推荐音乐',401);
    if (!['0','1'].includes(desired)) throw musicFault('歌曲推荐状态无效');
    await this.write(state=>{
      if (!state.songs.some(song=>song.id===songId)) throw musicFault('这首歌尚未收录，请先关联作品并写下推荐',404);
      const vote=state.endorsements.find(v=>v.songId===songId && v.userId===user.id), active=desired==='1';
      if (vote) { if(vote.active!==active){vote.active=active;vote.at=nowIso();} }
      else state.endorsements.push({songId,userId:user.id,active,at:nowIso()});
    });
    return this.recommendation(songId,user.id);
  }
  async publish(user, song, work, form, editId = '') {
    if (!user) throw musicFault('请先登录再分享音乐', 401);
    if (!song?.id || !song.title || song.privateCloudSong) throw musicFault('请选择搜索结果中的公开歌曲');
    if (!work?.gid || !work.title) throw musicFault('请选择作品库中的作品');
    if (!Object.hasOwn(musicRoles, form.role)) throw musicFault('请选择歌曲与作品的关系');
    const content = recommendationText(form.content);
    return this.write(state => {
      let post = state.posts.find(item => item.userId === user.id && item.songId === song.id);
      if (editId) {
        if (!post || post.id !== editId) throw musicFault('原推荐已不存在，请刷新后重试', 404);
        const unchanged=post.content===content && post.role===form.role && post.spoiler===(form.spoiler==='1') && post.work.gid===String(work.gid) && post.work.title===work.title;
        if (form.revision!==musicRevision(post)) {
          if (form.revision && unchanged) return post.id;
          throw Object.assign(musicFault('这份推荐已在其他页面更新。本次草稿仍保留，请对照最新内容后再保存',409),{musicCode:'edit-conflict',latest:{revision:musicRevision(post),content:post.content,work:post.work,role:post.role,spoiler:post.spoiler,updatedAt:post.updatedAt}});
        }
        if(unchanged)return post.id;
      } else if (post) throw Object.assign(musicFault('你已经推荐过这首歌，请编辑原推荐；本次正文已保留在草稿中', 409), { musicCode: 'duplicate', editUrl: '/music/share?edit=' + post.id });
      const existingSong = state.songs.find(item => item.id === song.id);
      // Store public metadata only. Tokens, personalized rights and temporary
      // audio URLs never enter the shared library.
      if (!existingSong) state.songs.push({ id: song.id, providerId: song.providerId, sourceId: song.sourceId || '', title: song.title, artists: [...song.artists], album: song.album || '', cover: song.cover || '', duration: song.duration || 0, url: song.url || '', addedAt: nowIso() });
      const patch = { work: { gid: String(work.gid), title: work.title }, role: form.role, content, spoiler: form.spoiler === '1', updatedAt: nowIso() };
      if (post) Object.assign(post, patch);
      else {
        post = { id: newId(12), userId: user.id, songId: song.id, createdAt: nowIso(), ...patch }; state.posts.push(post);
        const vote=state.endorsements.find(v=>v.songId===song.id && v.userId===user.id);
        if(vote){vote.active=true;vote.at=nowIso();}
        else state.endorsements.push({songId:song.id,userId:user.id,active:true,at:nowIso()});
      }
      return post.id;
    });
  }
  async edit(user, id, work, form) {
    const post = this.post(id);
    if (!post) throw musicFault('这条推荐已不存在', 404);
    if (post.userId !== user?.id) throw musicFault('只能修改自己的推荐', 403);
    return this.publish(user, this.song(post.songId), work, form, post.id);
  }
  async remove(user, id) {
    if (!user) throw musicFault('请先登录', 401);
    return this.write(state => {
      const post = state.posts.find(item => item.id === id);
      if (!post) throw musicFault('这条推荐已不存在', 404);
      if (post.userId !== user.id && !isSuperAdmin(user)) throw musicFault('只能移除自己的推荐', 403);
      state.posts = state.posts.filter(item => item.id !== id);
      state.likes = state.likes.filter(item => item.postId !== id);
      state.replies = state.replies.filter(item => item.postId !== id);
      state.notices = state.notices.filter(item => item.postId !== id);
      state.likeNotified = state.likeNotified.filter(key => !key.startsWith(id + ':'));
      // A song remains in the library after the last recommendation is removed.
      return true;
    });
  }
  async like(user, id, desired) {
    if (!user) throw musicFault('请先登录再点赞', 401);
    if (!['0', '1'].includes(desired)) throw musicFault('点赞状态无效');
    return this.write(state => {
      const post = state.posts.find(post => post.id === id);
      if (!post) throw musicFault('这条推荐已不存在', 404);
      state.likes = state.likes.filter(item => item.postId !== id || item.userId !== user.id);
      if (desired === '1') state.likes.push({ postId: id, userId: user.id });
      const key = id + ':' + user.id;
      if (desired === '1' && !state.likeNotified.includes(key)) { state.likeNotified.push(key); this.notice(state, { kind: 'like', recipientId: post.userId, actorId: user.id, postId: id }); }
      return true;
    });
  }
  notice(state, values) {
    if (values.recipientId === values.actorId || !this.db.users.get(values.recipientId)) return;
    state.notices.push({ id: 'music-' + newId(12), ...values, at: nowIso(), readAt: null });
    const owned = state.notices.filter(n=>n.recipientId===values.recipientId);
    const drop = new Set(owned.slice(0, Math.max(0,owned.length-300)).map(n=>n.id));
    state.notices = state.notices.filter(n=>!drop.has(n.id));
  }
  async reply(user, form) {
    if (!user) throw musicFault('请先登录再回复',401);
    const content = String(form.content || '').trim(), parentId = String(form.parentId || ''), token = String(form.token || '');
    if (musicTextLength(content)<2 || [...content].length>1000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(content)) throw musicFault('回复请填写 2—1000 字，表情不计入最低字数');
    if (!/^[a-f0-9]{24}$/.test(token)) throw musicFault('回复表单已失效，请刷新后重试');
    return this.write(state => {
      const post = state.posts.find(p=>p.id===form.postId); if (!post) throw musicFault('这条推荐已不存在',404);
      const prior = state.replies.find(r=>r.userId===user.id && r.token===token);
      if (prior) { if (prior.postId!==post.id || prior.content!==content || prior.parentId!==parentId || !!prior.spoiler!==(form.spoiler==='1')) throw Object.assign(musicFault('此前这份回复已经提交。请先查看已发布内容，草稿仍保留',409),{musicCode:'reply-conflict',replyUrl:this.destination({postId:prior.postId,replyId:prior.id})}); return prior; }
      const parent = parentId ? state.replies.find(r=>r.id===parentId && r.postId===post.id && !r.deletedAt) : null;
      if (parentId && !parent) throw musicFault('被回复的内容已不存在',404);
      if (state.replies.filter(r=>r.postId===post.id).length>=1000) throw musicFault('这条推荐的讨论已达到容量上限');
      const reply = { id: newId(12), postId: post.id, userId: user.id, parentId, token, content, spoiler:form.spoiler==='1', at: nowIso(), deletedAt: null };
      state.replies.push(reply);
      for (const recipientId of new Set([post.userId,parent?.userId].filter(Boolean))) this.notice(state,{kind:'reply',recipientId,actorId:user.id,postId:post.id,replyId:reply.id});
      return reply;
    });
  }
  async deleteReply(user, id) {
    if (!user) throw musicFault('请先登录',401);
    return this.write(state=>{
      const reply=state.replies.find(r=>r.id===id); if (!reply) throw musicFault('回复不存在',404);
      if (reply.userId!==user.id && !isSuperAdmin(user)) throw musicFault('只能移除自己的回复',403);
      reply.deletedAt ||= nowIso(); reply.content=''; return reply;
    });
  }
  thread(postId, page=1, size=20) {
    const rows=this.state.replies.filter(r=>r.postId===postId), pages=Math.max(1,Math.ceil(rows.length/size));
    page=Math.min(pages,Math.max(1,parseInt(page,10)||1));
    return { page,pages,total:rows.filter(r=>!r.deletedAt).length,rows:rows.slice((page-1)*size,page*size).map(r=>{const parent=r.parentId?rows.find(p=>p.id===r.parentId):null;return { ...r, member:this.db.users.get(r.userId),parent,parentMember:parent?this.db.users.get(parent.userId):null,parentUrl:parent?this.destination({postId,replyId:parent.id}):'' };}) };
  }
  destination(notice) {
    if (!this.post(notice.postId)) return '/messages';
    const rows=this.state.replies.filter(r=>r.postId===notice.postId), index=rows.findIndex(r=>r.id===notice.replyId);
    return '/music/post/'+notice.postId+(index>=0?'?page='+ (Math.floor(index/20)+1)+'#reply-'+notice.replyId:'');
  }
  unread(userId) { return this.state.notices.filter(n=>n.recipientId===userId && !n.readAt).length; }
  notices(userId) {
    return this.state.notices.filter(n=>n.recipientId===userId).map(n=>{
      const post=this.post(n.postId),reply=this.state.replies.find(r=>r.id===n.replyId),parent=reply?.parentId?this.state.replies.find(r=>r.id===reply.parentId):null;
      return { ...n,music:true,actor:this.db.users.get(n.actorId),game:{name:this.song(post?.songId)?.title || '音乐推荐'},directReply:parent?.userId===userId,unavailable:!post || n.kind==='reply' && (!reply || !!reply.deletedAt),excerpt:n.kind==='reply'?(reply?.deletedAt?'':reply?.spoiler?'这条回复含有剧透，打开讨论后查看。':(reply?.content || '').slice(0,150)):'',destination:this.destination(n) };
    });
  }
  async readNotice(userId,id) { return this.write(state=>{const n=state.notices.find(n=>n.id===id && n.recipientId===userId);if(!n)throw musicFault('通知不存在',404);n.readAt ||= nowIso();return this.destination(n);}); }
  async readAll(userId,before) { const cutoff=Date.parse(before);if(!Number.isFinite(cutoff)||cutoff>Date.now()+5000)throw musicFault('请刷新消息列表后重试');return this.write(state=>{for(const n of state.notices)if(n.recipientId===userId && !n.readAt && Date.parse(n.at)<=cutoff)n.readAt=nowIso();return true;}); }
  forWork(gid) {
    const posts=this.state.posts.filter(p=>p.work.gid===String(gid)), ids=[...new Set(posts.map(p=>p.songId))];
    return ids.map(id=>({song:this.song(id),count:this.recommendation(id).count,roles:[...new Set(posts.filter(p=>p.songId===id).map(p=>musicRoles[p.role]))]}));
  }
  activityIndex() {
    const updated=new Map(this.state.songs.map(song=>[song.id,Date.parse(song.addedAt)||0]));
    for(const post of this.state.posts)updated.set(post.songId,Math.max(updated.get(post.songId)||0,Date.parse(post.updatedAt)||0,Date.parse(post.createdAt)||0));
    return updated;
  }
  sortPopular(songs,counts=this.recommendationIndex()) {
    const updated=this.activityIndex();
    return songs.slice().sort((a,b)=>(counts.get(b.id)?.count||0)-(counts.get(a.id)?.count||0) || (updated.get(b.id)||0)-(updated.get(a.id)||0) || a.id.localeCompare(b.id));
  }
  ranking(user,limit=5) {
    const counts=this.recommendationIndex(user?.id);
    return this.sortPopular(this.state.songs,counts).filter(song=>(counts.get(song.id)?.count||0)>0).slice(0,limit).map(song=>({song,...counts.get(song.id)}));
  }
  highlights(user) {
    const counts=this.recommendationIndex(user?.id),ordered=this.sortPopular(this.state.songs,counts),row=song=>({song,...(counts.get(song.id)||{count:0,recommended:false})});
    return { archive:ordered.slice(0,8).map(song=>({...row(song),works:this.worksForSong(song.id)})),popular:ordered.filter(song=>(counts.get(song.id)?.count||0)>0).slice(0,5).map(row),recent:this.state.songs.slice(-3).reverse() };
  }
  view({ user, tab = 'feed', q = '', role = '', page = 1, songId = '', sort = 'recent' } = {}) {
    tab = ['feed', 'library', 'mine', 'popular'].includes(tab) ? tab : 'feed';
    q = String(q || '').trim().slice(0, 100).toLocaleLowerCase();
    role = Object.hasOwn(musicRoles, role || '') ? role : '';
    sort=tab==='popular'||sort==='popular'?'popular':'recent';
    const counts=this.recommendationIndex(user?.id),recommendation=id=>counts.get(id)||{count:0,recommended:false};
    const songMatch = song => !q || [song.title, song.album, ...song.artists].some(value => value.toLocaleLowerCase().includes(q));
    let posts = this.state.posts.filter(post => (!songId || post.songId === songId) && (!role || post.role === role));
    const workMatch = new Set(posts.filter(post => post.work.title.toLocaleLowerCase().includes(q)).map(post => post.songId));
    let songs = this.state.songs.filter(song => (!songId || song.id === songId) && (songMatch(song) || workMatch.has(song.id)));
    const songIds = new Set(songs.map(song => song.id));
    posts = posts.filter(post => songIds.has(post.songId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    if (role) songs = songs.filter(song => posts.some(post => post.songId === song.id));
    if (tab==='mine') songs=songs.filter(song=>user && (recommendation(song.id).recommended || this.owned(user.id,song.id)));
    if (tab==='popular') songs=songs.filter(song=>recommendation(song.id).count>0);
    const songList=tab!=='feed';
    const rows = songList ? sort==='popular'?this.sortPopular(songs,counts):songs.slice().reverse() : posts;
    const pages = Math.max(1, Math.ceil(rows.length / 12)); page = Math.min(pages, Math.max(1, Number.parseInt(page, 10) || 1));
    return { tab, q, role, sort, songList,page, pages, total: rows.length, songId, recommendation:songId?recommendation(songId):null,stats: { songs: this.state.songs.length, posts: this.state.posts.length, members: new Set(this.state.endorsements.filter(v=>v.active).map(v=>v.userId)).size }, rows: rows.slice((page - 1) * 12, page * 12).map(row => songList ? { song: row, ...recommendation(row.id),ownPostId:user?this.owned(user.id,row.id)?.id:'',roles:[...new Set(this.state.posts.filter(p=>p.songId===row.id).map(p=>musicRoles[p.role]))],works:this.worksForSong(row.id) } : { post: row, replyCount:this.state.replies.filter(r=>r.postId===row.id && !r.deletedAt).length, song: this.song(row.songId), ...recommendation(row.songId),member: this.db.users.get(row.userId), likes: this.state.likes.filter(item => item.postId === row.id).length, liked: this.state.likes.some(item => item.postId === row.id && item.userId === user?.id) }) };
  }
  async stop() { this.stopping = true; await this.queue; }
}
