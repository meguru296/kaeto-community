import { esc } from './utils.js';

// Reviews store plain text and named tokens. Only these allowlisted site assets
// can become images; arbitrary HTML, URLs and uploaded images stay plain text.
export const reviewStickers = [
  ['笑了', 'laugh'], ['比心', 'heart'], ['点头', 'nod'], ['摇头', 'shake'],
  ['哭哭', 'cry'], ['紧张', 'nervous'], ['敲头', 'bonk'], ['耍酷', 'cool'],
  ['打字', 'typing'], ['敲键盘', 'angry-typing'], ['工作', 'work'], ['摸鱼', 'tired-work'],
  ['馋了', 'hungry'], ['困了', 'sleep'], ['唱歌', 'sing'], ['应援', 'cheer'],
  ['红包', 'red-packet'], ['记录', 'note'], ['冒泡', 'peek'], ['加载中', 'loading'],
  ['说话', 'talk'], ['坐牢', 'jail'], ['驾驶', 'drive'], ['拍照', 'camera'],
].map(([name, file]) => ({ name, token: `[星标:${name}]`, url: `/img/review-stickers/optimized/${file}.webp`, preview: `/img/review-stickers/previews/${file}.webp` }));

// Keep saved reviews readable without modifying their stored text.
const legacyNames = { 思考: '紧张', 挥手: '应援', 盖章: '记录', 星标大头: '说话', 星标登场: '冒泡' };
export const legacyReviewStickers = Object.entries(legacyNames).map(([name, replacement]) => ({ ...reviewStickers.find(item => item.name === replacement), name, token: `[星标:${name}]` }));
const stickerByName = new Map([...reviewStickers, ...legacyReviewStickers].map(item => [item.name, item]));

export function renderReviewText(content = '') {
  const text = String(content);
  const pattern = /\[星标:([^\]\n]+)\]/g;
  let html = '', start = 0;
  for (const match of text.matchAll(pattern)) {
    html += esc(text.slice(start, match.index));
    const sticker = stickerByName.get(match[1]);
    html += sticker ? `<img class="review-sticker" src="${sticker.preview}" data-sticker-animation="${sticker.url}" alt="${esc(sticker.token)}" title="星标 · ${esc(sticker.name)}" width="72" height="72" loading="lazy">` : esc(match[0]);
    start = match.index + match[0].length;
  }
  return (html + esc(text.slice(start))).replace(/\n/g, '<br>');
}
