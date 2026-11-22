(() => {
  const room = document.querySelector('[data-listening-room]'); if (!room) return;
  const rows = [...room.querySelectorAll('[data-mp-item]')], slot = room.querySelector('[data-mp-slot]'), load = room.querySelector('[data-mp-load]'), close = room.querySelector('[data-mp-close]'), source = room.querySelector('[data-mp-source]'), feedback = room.querySelector('[data-mp-feedback]');
  let index = Math.max(0, rows.findIndex(row => row.querySelector('[aria-current]'))), mounted = false;
  function unmount() { slot.replaceChildren(); mounted = false; close.hidden = true; room.classList.remove('mp-player-open'); }
  function select(next) {
    if (!rows.length) return;
    index = (next + rows.length) % rows.length; unmount(); const row = rows[index];
    for (const item of rows) { const a = item.querySelector('[data-mp-select]'); if (item === row) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); }
    room.querySelector('[data-mp-title]').textContent = row.dataset.title;
    room.querySelector('[data-mp-artist]').textContent = row.dataset.artist;
    room.querySelector('[data-mp-note]').textContent = row.dataset.note;
    source.href = row.dataset.url; source.hidden = false; load.textContent = '▶ 加载播放器';
    feedback.textContent = '点击后加载网易云播放器，再点击其中的播放按钮。';
    const url = new URL(location.href); url.searchParams.set('play', row.dataset.id); history.replaceState(null, '', url);
  }
  rows.forEach((row, i) => row.querySelector('[data-mp-select]').addEventListener('click', event => { event.preventDefault(); select(i); }));
  room.querySelector('[data-mp-previous]').addEventListener('click', () => select(index - 1));
  room.querySelector('[data-mp-next]').addEventListener('click', () => select(index + 1));
  load.addEventListener('click', () => {
    if (!rows.length) return;
    if (mounted) { unmount(); load.textContent = '▶ 加载播放器'; feedback.textContent = '播放器已关闭。'; return; }
    const row = rows[index], url = new URL(row.dataset.embed);
    if (url.origin !== 'https://music.163.com' || url.pathname !== '/outchain/player') return;
    const frame = document.createElement('iframe'); frame.src = url.href; frame.title = row.dataset.title + ' · 网易云音乐'; frame.height = row.dataset.kind === 'song' ? '86' : '450'; frame.referrerPolicy = 'no-referrer';
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox');
    slot.replaceChildren(frame); mounted = true; close.hidden = false; room.classList.add('mp-player-open'); load.textContent = '关闭播放器';
    feedback.textContent = '请在播放器内控制播放与暂停。若加载失败或曲目受限，可前往网易云收听。';
  });
  close.addEventListener('click', () => { unmount(); load.textContent = '▶ 加载播放器'; feedback.textContent = '播放器已关闭。'; });
})();
