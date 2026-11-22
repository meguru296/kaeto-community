(() => {
  const form = document.querySelector('[data-music-composer]');
  const element = (tag, text, className) => { const node = document.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node; };
  async function request(url, options = {}) {
    let response, data;
    try { response = await fetch(url, { signal:AbortSignal.timeout(25000), ...options, headers: { Accept: 'application/json', ...options.headers } }); data = await response.json(); }
    catch { throw Error('网络暂时不可用，请稍后重试；已填写的内容仍保留在页面中。'); }
    if (!response.ok) throw Object.assign(Error(data.error || '暂时无法完成，请稍后重试'),{musicCode:data.musicCode,editUrl:data.editUrl,latest:data.latest,replyUrl:data.replyUrl});
    return data;
  }
  let archiveRecords=[];
  function createEndorsement(song,row,signedIn) {
    const box=element('div',null,'mu-endorsement');box.dataset.endorsementSong=song.id;
    if(signedIn){
      const voteForm=element('form');voteForm.method='post';voteForm.action='/api/music/endorse';voteForm.dataset.musicEndorse='';voteForm.dataset.songId=song.id;voteForm.dataset.songTitle=song.title;
      for(const [name,value] of Object.entries({songId:song.id,recommended:row.recommended?'0':'1'})){const input=element('input');input.type='hidden';input.name=name;input.value=value;voteForm.append(input);}
      const button=element('button',null,'mu-endorse-button');button.type='submit';button.dataset.noLock='1';button.setAttribute('aria-pressed',String(!!row.recommended));button.setAttribute('aria-label',`${row.recommended?'取消推荐':'推荐'}《${song.title}》`);
      const label=element('span',row.recommended?'✓ 已推荐':'＋ 我也推荐');label.dataset.endorseLabel='';button.append(label);voteForm.append(button);box.append(voteForm);
    }else{const link=element('a','＋ 我也推荐','mu-endorse-button');link.href='/login';box.append(link);}
    const count=element('span',`${row.count} 人推荐`,'mu-endorse-count');count.dataset.endorseTotal=song.id;
    const status=element('p',null,'mu-endorse-feedback');status.setAttribute('role','status');box.append(count,status);return box;
  }
  function updatePopular(rows) {
    const list=document.querySelector('[data-music-popular]');if(!list)return;
    list.replaceChildren(...rows.map(({song,count},index)=>{
      const link=element('a',null,'mu-popular-item');link.href='/music/song/'+encodeURIComponent(song.id);
      const art=element('span',null,'mu-art');songArt(art,song);
      const copy=element('span',null,'mu-popular-copy'),total=element('b',`${count} 人推荐`);total.dataset.endorseTotal=song.id;
      copy.append(element('strong',song.title),element('small',song.artists.join(' / ')),total);
      link.append(element('span',String(index+1).padStart(2,'0'),'mu-rank-number'),art,copy);return link;
    }));
    if(!rows.length)list.append(element('p','推荐你喜欢的歌，让它出现在这里。','mu-muted'));musicArt(list);
  }
  const pendingSongs=new Set();
  document.addEventListener('submit',async event=>{
    const voteForm=event.target.closest('form[data-music-endorse]');if(!voteForm)return;
    event.preventDefault();const id=voteForm.dataset.songId;if(pendingSongs.has(id))return;
    pendingSongs.add(id);
    const forms=()=>[...document.querySelectorAll('[data-music-endorse]')].filter(f=>f.dataset.songId===id);
    forms().forEach(f=>f.querySelector('button').disabled=true);
    const feedback=voteForm.closest('.mu-endorsement').querySelector('.mu-endorse-feedback');
    try{
      const result=await request(voteForm.action,{method:'POST',body:new URLSearchParams(new FormData(voteForm))});
      for(const record of archiveRecords)if(record.song.id===id){record.count=result.count;record.recommended=result.recommended;}
      forms().forEach(f=>{f.elements.recommended.value=result.recommended?'0':'1';const button=f.querySelector('button');button.setAttribute('aria-pressed',String(result.recommended));button.setAttribute('aria-label',`${result.recommended?'取消推荐':'推荐'}《${f.dataset.songTitle}》`);f.querySelector('[data-endorse-label]').textContent=result.recommended?'✓ 已推荐':'＋ 我也推荐';});
      document.querySelectorAll('[data-endorse-total]').forEach(node=>{if(node.dataset.endorseTotal===id)node.textContent=`${result.count} 人推荐`;});
      updatePopular(result.popular);
      document.querySelectorAll('[data-music-member-total]').forEach(node=>node.textContent=result.members);
      feedback.textContent=result.recommended?'已加入我的推荐':'已取消歌曲推荐';
      // Ranked/personal lists and the supporter list need their server-derived
      // ordering and pagination refreshed, rather than showing stale rows.
      if(document.querySelector('.mu-song-page') || ['mine','popular'].includes(document.querySelector('[data-music-tab]')?.dataset.musicTab))location.reload();
    }catch(error){feedback.textContent=error.message;}
    finally{pendingSongs.delete(id);forms().forEach(f=>f.querySelector('button').disabled=false);}
  });
  const archive = document.querySelector('[data-music-archive]');
  if (archive) {
    try { archiveRecords = JSON.parse(archive.dataset.musicArchive); } catch {}
    const records=archiveRecords;
    const buttons = [...archive.querySelectorAll('[data-archive-select]')];
    const set = (key, text) => { archive.querySelector(`[data-archive-${key}]`).textContent = text; };
    const selectRecord = index => {
      const row = records[index];
      if (!row) return;
      const { song, works, count } = row;
      buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
      archive.querySelectorAll('[data-archive-record]').forEach(record => { record.hidden = Number(record.dataset.archiveRecord) !== index; });
      set('index', String(index + 1).padStart(2, '0'));
      set('title', song.title);
      set('artist', song.artists.join(' / ') || '艺人资料待补充');
      set('album', song.album || '专辑资料待补充');
      set('duration', song.duration > 0 ? `${Math.floor(song.duration / 60000)}:${String(Math.floor(song.duration / 1000) % 60).padStart(2, '0')}` : '待补充');
      set('count', `${count} 人推荐`);
      archive.querySelector('[data-archive-count]').dataset.endorseTotal=song.id;
      archive.querySelector('[data-archive-endorse]').replaceChildren(createEndorsement(song,row,archive.dataset.musicSignedIn==='true'));
      archive.querySelector('[data-archive-endorse] button')?.toggleAttribute('disabled',pendingSongs.has(song.id));
      const worksBox = archive.querySelector('[data-archive-works]');
      worksBox.replaceChildren(...works.map(work => {
        const link = element('a', null, 'mu-work'), copy = element('span', null, 'mu-work-copy');
        link.href = '/game/' + encodeURIComponent(work.gid);
        link.setAttribute('aria-label', `查看作品《${work.title}》`);
        copy.append(element('small', '关联作品'), element('strong', work.title));
        link.append(copy, element('b', '查看作品 →'));
        return link;
      }));
      const source = archive.querySelector('[data-archive-source]');
      if (/^https:\/\/music\.163\.com\/song\?id=[1-9]\d*$/.test(song.url || '')) {
        const link = element('a', '▶ 网易云收听 ↗', 'mu-listen');
        link.href = song.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
        link.setAttribute('aria-label', `去网易云收听《${song.title}》（新窗口）`);
        source.replaceChildren(link);
      } else source.replaceChildren(element('span', '收听链接待补充', 'mu-muted'));
      archive.querySelector('[data-archive-details]').href = '/music/song/' + encodeURIComponent(song.id);
      set('status', `已选择《${song.title}》，歌曲资料与作品入口已更新。`);
    };
    buttons.forEach((button, index) => {
      button.addEventListener('click', () => {
        selectRecord(index);
        if (matchMedia('(max-width:720px)').matches) archive.querySelector('.mu-dossier').scrollIntoView({ block:'start', behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth' });
      });
      button.addEventListener('keydown', event => {
        let next;
        if (event.key === 'ArrowRight') next = (index + 1) % buttons.length;
        else if (event.key === 'ArrowLeft') next = (index - 1 + buttons.length) % buttons.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = buttons.length - 1;
        else return;
        event.preventDefault(); buttons[next].focus(); selectRecord(next);
      });
    });
  }
  if (form) {
    const field = name => form.elements.namedItem(name);
    const query = form.querySelector('[data-music-query]'), results = form.querySelector('[data-music-results]'), searchStatus = form.querySelector('[data-music-search-status]');
    const chosen = form.querySelector('[data-music-chosen]'), workQuery = form.querySelector('[data-music-work-query]'), workResults = form.querySelector('[data-music-work-results]'), workChosen = form.querySelector('[data-music-chosen-work]');
    const searchPanel=form.querySelector('[data-music-search-panel]'),workPanel=form.querySelector('[data-music-work-panel]'),workSelection=form.querySelector('[data-music-work-selection]'),more=form.querySelector('[data-music-search-more]');
    const textarea = field('content'), feedback = form.querySelector('[data-music-feedback]'), count = form.querySelector('[data-music-count]'), preview = form.querySelector('[data-music-preview-body]');
    const editButton = form.querySelector('[data-music-edit]'), previewButton = form.querySelector('[data-music-preview]'), picker = form.querySelector('[data-music-stickers]'), toggle = form.querySelector('[data-music-stickers-toggle]');
    const stickers = new Map([...picker.querySelectorAll('[data-music-sticker]')].map(button => [button.dataset.musicSticker, button.dataset.url]));
    const draftKey = 'kaeto:music-draft:' + form.dataset.member + ':' + (form.dataset.edit || (form.dataset.work ? 'work-'+form.dataset.work : form.dataset.songContext ? 'song-'+form.dataset.songContext : 'new'));
    let selectionStart = textarea.selectionStart, selectionEnd = textarea.selectionEnd, songView = null, searchSequence = 0, workSequence = 0, saving = false, expiresAt=0, ownedEditUrl='';
    let searchKeyword='',nextOffset=0,loadingMore=false;const resultIds=new Set();
    try { songView = JSON.parse(form.dataset.song || 'null'); } catch {}
    function bodyLength() { return [...textarea.value.replace(/\[星标:[^\]\n]*\]/g, '').replace(/[\s\p{Cf}]/gu, '')].length; }
    function update() { count.textContent = `正文 ${bodyLength()} / 至少 50 字 · ${[...textarea.value].length}/2000`; }
    function draft() {
      try {
        localStorage.setItem(draftKey, JSON.stringify({ version: form.dataset.updatedAt || '', content: textarea.value, gid: field('gid').value, workTitle: workChosen.textContent, role: field('role').value, spoiler: field('spoiler').checked, selection: field('selection').value, songId: field('songId').value, song: songView, expiresAt,editUrl:ownedEditUrl }));
        form.querySelector('[data-music-draft]').textContent = '草稿已保存在当前浏览器。';
      } catch { form.querySelector('[data-music-draft]').textContent = '当前浏览器无法保存草稿，请保留此页面。'; }
    }
    function showEdit(focus = false) {
      textarea.hidden = false; preview.hidden = true;
      editButton.setAttribute('aria-pressed', 'true'); previewButton.setAttribute('aria-pressed', 'false');
      if (focus) textarea.focus({ preventScroll: true });
    }
    function showPreview() {
      preview.replaceChildren(); let start = 0;
      for (const match of textarea.value.matchAll(/\[星标:[^\]\n]*\]/g)) {
        preview.append(document.createTextNode(textarea.value.slice(start, match.index)));
        if (stickers.has(match[0])) { const img = element('img', null, 'review-sticker'); img.dataset.stickerAnimation=stickers.get(match[0]); img.src = img.dataset.stickerAnimation.replace('/optimized/','/previews/'); img.alt = match[0]; img.width = img.height = 72; preview.append(img); }
        else preview.append(document.createTextNode(match[0]));
        start = match.index + match[0].length;
      }
      preview.append(document.createTextNode(textarea.value.slice(start) || (textarea.value ? '' : '写下你的推荐，就可以在这里预览。')));
      textarea.hidden = true; preview.hidden = false;
      editButton.setAttribute('aria-pressed', 'false'); previewButton.setAttribute('aria-pressed', 'true');
    }
    function remember() { selectionStart = textarea.selectionStart; selectionEnd = textarea.selectionEnd; }
    ['keyup', 'click', 'select', 'blur'].forEach(event => textarea.addEventListener(event, remember));
    textarea.addEventListener('input', () => { remember(); update(); feedback.textContent = ''; });
    form.addEventListener('input', draft); form.addEventListener('change', draft);
    editButton.addEventListener('click', () => showEdit(true)); previewButton.addEventListener('click', showPreview);
    toggle.addEventListener('click', () => { picker.hidden = !picker.hidden; toggle.setAttribute('aria-expanded', String(!picker.hidden)); });
    picker.querySelectorAll('[data-music-sticker]').forEach(button => button.addEventListener('click', () => {
      showEdit(true); textarea.setRangeText(button.dataset.musicSticker, selectionStart, selectionEnd, 'end'); remember(); update(); draft();
    }));
    function resetSong() {
      ++searchSequence;searchPanel.hidden=false;results.replaceChildren();more.hidden=true;
      form.querySelector('[data-music-search-cancel]').hidden=!songView;query.focus();
    }
    form.querySelector('[data-music-change]')?.addEventListener('click', resetSong);
    form.querySelector('[data-music-search-cancel]').addEventListener('click',()=>{if(songView){++searchSequence;searchPanel.hidden=true;}});
    form.querySelector('[data-music-work-change]').addEventListener('click',()=>{workPanel.hidden=false;workQuery.focus();});
    form.querySelector('[data-music-work-cancel]').addEventListener('click',()=>{if(field('gid').value){++workSequence;workPanel.hidden=true;}});
    function chooseWork(gid,title){field('gid').value=gid;workChosen.textContent=title;workSelection.hidden=false;workPanel.hidden=true;workResults.replaceChildren();form.querySelector('[data-music-work-cancel]').hidden=false;}
    function duplicate(editUrl) {
      form.querySelector('.mu-duplicate')?.remove();
      const notice=element('p','你已经推荐过这首歌。','mu-duplicate'),link=element('a','编辑原推荐 →');link.href=editUrl;
      notice.append(link);chosen.before(notice);form.querySelector('[type=submit]').disabled=true;
    }
    function drawSong(song, token, until=0, editUrl='') {
      ++searchSequence;searchPanel.hidden=true;more.hidden=true;
      expiresAt=until;ownedEditUrl=editUrl;
      form.querySelector('.mu-duplicate')?.remove();form.querySelector('[type=submit]').disabled=false;
      songView = song; field('selection').value = token || ''; field('songId').value = token ? '' : song.id;
      chosen.replaceChildren(); chosen.hidden = false;
      const box = element('div', null, 'mu-song'), art = element('span', null, 'mu-art');
      songArt(art,song);
      const copy = element('div', null, 'mu-song-copy'); copy.append(element('h3', song.title), element('p', (song.artists || []).join(' / ')), element('p', song.album || '', 'mu-album'));
      box.append(art, copy); chosen.append(box);
      const change = element('button', '更换歌曲'); change.type = 'button'; change.addEventListener('click', resetSong); chosen.append(change); results.replaceChildren();
      if(editUrl)duplicate(editUrl);
      musicArt(chosen);
    }
    async function refreshSong() {
      const current=songView;if(!current)return;
      feedback.textContent='正在重新确认歌曲，正文和作品关联会保留…';
      try {
        const data=await request('/api/music/search?q='+encodeURIComponent(current.title));
        const row=data.rows.find(r=>r.song.id===current.id);
        if(!row)throw Error(data.notice || '暂时找不到原来的歌曲版本，请重新选歌；正文和作品关联已保留。');
        drawSong(row.song,row.token,row.expiresAt,row.editUrl);draft();
        feedback.textContent=row.editUrl?'这首歌已有你的推荐，请编辑原推荐。':'歌曲已重新确认，请再点一次发布推荐。';
      } catch(error) {feedback.textContent=error.message;const retry=element('button','重新确认歌曲');retry.type='button';retry.addEventListener('click',refreshSong);feedback.append(document.createTextNode(' '),retry);}
    }
    async function searchSongs(append=false) {
      if (!query.value.trim()) { query.focus(); return; }
      if(append && (loadingMore || query.value.trim()!==searchKeyword))return;
      const offset=append?nextOffset:0,keyword=query.value.trim();if(!append){searchKeyword=keyword;resultIds.clear();results.replaceChildren();}
      loadingMore=true;more.disabled=true;more.hidden=true;
      const sequence = ++searchSequence; searchStatus.textContent = '正在查找歌曲…';
      try {
        const data = await request('/api/music/search?q=' + encodeURIComponent(keyword)+'&offset='+offset);
        if (sequence !== searchSequence) return;
        if(append && data.source!=='netease'){searchStatus.textContent=data.notice || '暂时无法加载下一页，请稍后重试。';more.hidden=false;return;}
        searchStatus.textContent = data.notice || (data.rows.length ? '选择你想推荐的版本。' : append?'已显示全部结果。':'没有找到歌曲，试试原名或歌手名。');
        data.rows.forEach(row => {
          if(resultIds.has(row.song.id))return;resultIds.add(row.song.id);
          const button = element('button', null, 'mu-search-result mu-song-result'); button.type = 'button';
          const art=element('span',null,'mu-art');songArt(art,row.song);
          const copy = element('span'); copy.append(element('strong', row.song.title), element('small', [row.song.artists.join(' / '), row.song.album].filter(Boolean).join(' · ')));
          const end=element('span',null,'mu-result-end');end.append(element('small',songDuration(row.song.duration)),element('span',row.editUrl?'已推荐 · 去编辑':'选择 →'));
          button.append(art,copy,end); button.addEventListener('click', () => { drawSong(row.song, row.token,row.expiresAt,row.editUrl); draft(); }); results.append(button);
        });
        nextOffset=data.nextOffset;more.hidden=!data.hasMore;musicArt(results);
      } catch (error) { if (sequence === searchSequence){searchStatus.textContent = error.message;more.hidden=!append;} }
      finally{if(sequence===searchSequence){loadingMore=false;more.disabled=false;}}
    }
    async function searchWorks() {
      const q = workQuery.value.trim(); if (!q) { workQuery.focus(); return; }
      const sequence = ++workSequence; workResults.replaceChildren(element('p', '正在查找作品…', 'mu-muted'));
      try {
        const data = await request('/api/music/works?q=' + encodeURIComponent(q));
        if (sequence !== workSequence) return;
        workResults.replaceChildren();
        if (!data.rows.length) workResults.append(element('p', '本站作品资料中没有找到，试试原名或简称。', 'mu-muted'));
        data.rows.forEach(work => {
          const button = element('button', null, 'mu-search-result'); button.type = 'button';
          const copy = element('span'); copy.append(element('strong', work.title)); if (work.original && work.original !== work.title) copy.append(element('small', work.original));
          button.append(copy, element('span', '关联 →'));
          button.addEventListener('click', () => {++workSequence;chooseWork(work.gid,work.title);draft();}); workResults.append(button);
        });
      } catch (error) { if (sequence === workSequence) workResults.replaceChildren(element('p', error.message, 'mu-muted')); }
    }
    form.querySelector('[data-music-search]').addEventListener('click',()=>searchSongs());
    more.addEventListener('click',()=>searchSongs(true));
    form.querySelector('[data-music-work-search]').addEventListener('click', searchWorks);
    [[query, searchSongs], [workQuery, searchWorks]].forEach(([input, action]) => input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); action(); } }));
    function conflict(latest){
      if(!latest || !/^[a-f0-9]{64}$/.test(latest.revision||''))return;
      const panel=form.querySelector('[data-music-conflict]');panel.hidden=false;panel.replaceChildren(element('h3','推荐已经更新，请对照后继续'));
      panel.append(element('p','你的修改仍在上方编辑框中，下面是最新保存的内容。'));
      panel.append(element('p',`${latest.work?.title || ''} · ${({op:'OP',ed:'ED',bgm:'BGM',insert:'插入曲',other:'其他'})[latest.role] || ''}${latest.spoiler?' · 含剧透':''}`));
      const text=element('textarea');text.readOnly=true;text.value=latest.content;text.setAttribute('aria-label','最新保存的推荐正文');text.className='input';panel.append(text);
      const confirm=element('button','已对照，保留我的修改继续编辑','btn btn-ghost');confirm.type='button';confirm.addEventListener('click',()=>{field('revision').value=latest.revision;form.dataset.updatedAt=latest.revision;panel.hidden=true;draft();feedback.textContent='已更新编辑依据，请确认上方正文后再次保存。';});panel.append(confirm);
      feedback.textContent='其他页面已经更新了这份推荐，当前草稿没有被覆盖。';
    }
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey) || 'null');
      // Restore stale edit drafts into comparison mode; never discard them.
      // New-song selections still require server-side ownership and expiry.
      if (saved && typeof saved.content === 'string') {
        const latest=form.dataset.edit && saved.version!==form.dataset.updatedAt?{revision:form.dataset.updatedAt,content:textarea.value,work:{gid:field('gid').value,title:workChosen.textContent},role:field('role').value,spoiler:field('spoiler').checked}:null;
        textarea.value = saved.content.slice(0, 4000); field('gid').value = typeof saved.gid === 'string' ? saved.gid : '';
        if(field('gid').value)chooseWork(field('gid').value,typeof saved.workTitle==='string'?saved.workTitle.replace(/^已关联：/,''):'');
        const role = [...form.querySelectorAll('[name="role"]')].find(input => input.value === saved.role); if (role) role.checked = true;
        field('spoiler').checked = saved.spoiler === true;
        if (!form.dataset.edit && saved.song && typeof saved.song.title === 'string' && Array.isArray(saved.song.artists)) { drawSong(saved.song, typeof saved.selection === 'string' ? saved.selection : '',Number(saved.expiresAt)||0,/^\/music\/share\?edit=[a-f0-9]{24}$/.test(saved.editUrl||'')?saved.editUrl:''); if(!saved.selection && saved.songId===saved.song.id)field('songId').value=saved.songId; }
        form.querySelector('[data-music-draft]').textContent = '已恢复当前浏览器的草稿；选歌过期时需要重新选择。';
        if(latest){field('revision').value=saved.version||'';form.dataset.updatedAt=saved.version||'';conflict(latest);}
      }
    } catch {}
    form.querySelector('[type="submit"]').addEventListener('click', () => showEdit());
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (saving) return;
      showEdit(); update(); feedback.textContent = '';
      if (!field('selection').value && !field('songId').value) { feedback.textContent = '请先搜索并选择一首歌。'; query.focus(); return; }
      if (!field('gid').value) { feedback.textContent = '请先选择关联作品。'; workQuery.focus(); return; }
      if (bodyLength() < 50 || [...textarea.value].length > 2000) { feedback.textContent = '推荐正文需要 50—2000 字，空白和表情包标记不计入最低字数。'; textarea.focus(); return; }
      if (!form.dataset.edit && field('selection').value && expiresAt && expiresAt<=Date.now()) { await refreshSong();return; }
      saving = true; const button = form.querySelector('[type="submit"]'); button.disabled = true; button.textContent = '正在保存…';
      try {
        const data = await request(form.action, { method: 'POST', body: new URLSearchParams(new FormData(form)) });
        try { localStorage.removeItem(draftKey); } catch {}
        location.assign(data.url);
      } catch (error) {
        feedback.textContent = error.message; saving = false; button.disabled = false; button.textContent = form.dataset.edit ? '保存推荐 →' : '发布推荐 →';
        if(error.musicCode==='duplicate' && /^\/music\/share\?edit=[a-f0-9]{24}$/.test(error.editUrl||''))duplicate(error.editUrl);
        if(error.musicCode==='selection-expired')await refreshSong();
        if(error.musicCode==='edit-conflict')conflict(error.latest);
      }
    });
    update();
  }
  function songDuration(value){return value>0?`${Math.floor(value/60000)}:${String(Math.floor(value/1000)%60).padStart(2,'0')}`:'';}
  function songArt(art,song){
    if(typeof song.cover==='string' && /^https:\/\/p\d+\.music\.126\.net\//.test(song.cover)){const img=element('img');const url=new URL(song.cover);url.searchParams.set('param','160y160');img.src=url.href;img.alt=song.title+'封面';img.referrerPolicy='no-referrer';img.loading='lazy';art.append(img);}
    else art.append(element('span','♪','mu-fallback-note'));
  }
  function musicArt(root=document) {
    root.querySelectorAll('.mu-art img').forEach(img=>{
      const fallback=()=>{const note=element('span','♪','mu-fallback-note');note.setAttribute('role','img');note.setAttribute('aria-label','封面暂时无法加载');img.replaceWith(note);};
      img.addEventListener('error',fallback,{once:true});if(img.complete&&!img.naturalWidth)fallback();
    });
  }
  musicArt();
  const replyForm=document.querySelector('[data-music-reply-form]');
  if(replyForm){
    const textarea=replyForm.elements.content,feedback=replyForm.querySelector('[data-music-reply-feedback]'),target=replyForm.querySelector('[data-music-reply-target]'),cancel=replyForm.querySelector('[data-music-reply-cancel]');
    const draftKey='kaeto:music-reply:'+replyForm.elements.postId.value+':'+document.querySelector('[data-music-member]')?.dataset.musicMember;
    try{const saved=JSON.parse(sessionStorage.getItem(draftKey)||'null');if(saved){textarea.value=String(saved.content||'').slice(0,1000);replyForm.elements.spoiler.checked=saved.spoiler===true;if(/^[a-f0-9]{24}$/.test(saved.parentId||'')){replyForm.elements.parentId.value=saved.parentId;target.textContent='回复此前选择的群友';target.hidden=cancel.hidden=false;}if(/^[a-f0-9]{24}$/.test(saved.token||''))replyForm.elements.token.value=saved.token;}}catch{}
    const save=()=>{try{sessionStorage.setItem(draftKey,JSON.stringify({content:textarea.value,token:replyForm.elements.token.value,parentId:replyForm.elements.parentId.value,spoiler:replyForm.elements.spoiler.checked}));}catch{}};
    replyForm.elements.spoiler.addEventListener('change',save);
    textarea.addEventListener('input',save);
    let start=textarea.selectionStart,end=textarea.selectionEnd;
    ['keyup','click','select','blur'].forEach(e=>textarea.addEventListener(e,()=>{start=textarea.selectionStart;end=textarea.selectionEnd;}));
    replyForm.querySelectorAll('[data-music-reply-sticker]').forEach(b=>b.addEventListener('click',()=>{textarea.setRangeText(b.dataset.musicReplySticker,start,end,'end');start=end=textarea.selectionEnd;textarea.focus();save();}));
    document.querySelectorAll('[data-music-reply-to]').forEach(b=>b.addEventListener('click',()=>{replyForm.elements.parentId.value=b.dataset.musicReplyTo;target.textContent='回复 '+b.dataset.name;target.hidden=cancel.hidden=false;save();textarea.focus();}));
    cancel.addEventListener('click',()=>{replyForm.elements.parentId.value='';target.hidden=cancel.hidden=true;save();});
    replyForm.addEventListener('submit',async event=>{
      event.preventDefault();const button=replyForm.querySelector('[type=submit]');if(button.disabled)return;
      const length=[...textarea.value.replace(/\[星标:[^\]\n]*\]/g,'').replace(/[\s\p{Cf}]/gu,'')].length;
      if(length<2 || [...textarea.value].length>1000){feedback.textContent='回复请填写 2—1000 字，表情不计入最低字数。';return;}
      button.disabled=true;feedback.textContent='正在保存…';save();
      try{const data=await request(replyForm.action,{method:'POST',body:new URLSearchParams(new FormData(replyForm))});try{sessionStorage.removeItem(draftKey);}catch{}location.assign(data.url);}
      catch(error){feedback.textContent=error.message;button.disabled=false;if(error.musicCode==='reply-conflict' && /^\/music\/post\/[a-f0-9]{24}/.test(error.replyUrl||'')){const link=element('a','查看此前已发布的回复');link.href=error.replyUrl;feedback.append(link);const fresh=element('button','保留草稿，作为一条新回复继续');fresh.type='button';fresh.addEventListener('click',()=>{const bytes=new Uint8Array(12);crypto.getRandomValues(bytes);replyForm.elements.token.value=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');save();feedback.textContent='已准备新的回复，请确认正文后再提交。';});feedback.append(fresh);}}
    });
  }
  document.querySelectorAll('[data-music-reply-remove]').forEach(form=>form.addEventListener('submit',async event=>{
    event.preventDefault();if(!confirm('移除这条回复？'))return;const button=form.querySelector('button');if(button.disabled)return;button.disabled=true;
    try{const data=await request(form.action,{method:'POST',body:new URLSearchParams(new FormData(form))});location.assign(data.url);}catch(error){button.disabled=false;const p=element('p',error.message,'mu-muted');form.after(p);}
  }));
  document.querySelectorAll('[data-music-like]').forEach(likeForm => likeForm.addEventListener('submit', async event => {
    event.preventDefault(); const button = likeForm.querySelector('button'); if (button.disabled) return; button.disabled = true;
    const feedback = likeForm.closest('.mu-post').querySelector('.mu-inline-feedback');
    try {
      const data = await request(likeForm.action, { method: 'POST', body: new URLSearchParams(new FormData(likeForm)) });
      likeForm.elements.liked.value = data.liked ? '0' : '1'; button.setAttribute('aria-pressed', String(data.liked));
      button.setAttribute('aria-label',data.liked?'取消赞这篇推荐':'赞这篇推荐');
      button.replaceChildren(document.createTextNode(data.liked ? '♥ ' : '♡ '), element('span', data.count ? '赞这篇推荐 · '+data.count : '赞这篇推荐')); feedback.textContent = '';
    } catch (error) { feedback.textContent = error.message; }
    finally { button.disabled = false; }
  }));
})();
