import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';

/* ------------------------------------------------------------------ *
 * 基础工具
 * ------------------------------------------------------------------ */

export function nowIso() {
  return new Date().toISOString();
}

export function newId(bytes = 8) {
  return randomBytes(bytes).toString('hex');
}

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** HTML 转义：所有用户输入进入模板前都必须经过它 */
export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/** 供 <script> 内联 JSON 使用，防止 </script> 提前闭合 */
export function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function clampInt(value, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return null;
  if (n < min || n > max) return null;
  return n;
}

export function str(value, max = 200) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\r\n/g, '\n').trim().slice(0, max);
}

/** 评分分档（1-10），文案参考 bangumi 的直观感受 */
export const SCORE_BANDS = [
  { min: 10, label: '超神作', tone: 's10' },
  { min: 9, label: '神作', tone: 's9' },
  { min: 8, label: '很棒', tone: 's8' },
  { min: 7, label: '不错', tone: 's7' },
  { min: 6, label: '还行', tone: 's6' },
  { min: 5, label: '一般', tone: 's5' },
  { min: 4, label: '略差', tone: 's4' },
  { min: 3, label: '较差', tone: 's3' },
  { min: 2, label: '差', tone: 's2' },
  { min: 1, label: '很差', tone: 's1' },
];

export function scoreLabel(score) {
  const n = Number(score);
  if (!Number.isFinite(n) || n <= 0) return '未评分';
  const band = SCORE_BANDS.find((b) => n >= b.min);
  return band ? band.label : '未评分';
}

export function scoreTone(score) {
  const n = Number(score);
  if (!Number.isFinite(n) || n <= 0) return 's0';
  if (n >= 9) return 's9';
  if (n >= 8) return 's8';
  if (n >= 7) return 's7';
  if (n >= 6) return 's6';
  if (n >= 5) return 's5';
  return 's4';
}

export function fmtScore(avg) {
  if (!avg || !Number.isFinite(Number(avg))) return '—';
  return Number(avg).toFixed(2);
}

export function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fmtDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromNow(value) {
  const d = new Date(value).getTime();
  if (!Number.isFinite(d)) return '—';
  const diff = Date.now() - d;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.floor(hour / 24);
  if (day < 30) return `${day} 天前`;
  return fmtDate(value);
}

export function plural(n, unit = '条') {
  return `${n} ${unit}`;
}

/* ------------------------------------------------------------------ *
 * 口令散列（scrypt）
 * ------------------------------------------------------------------ */

const SCRYPT_KEYLEN = 64;

function scryptAsync(password, salt) {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, SCRYPT_KEYLEN, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scryptAsync(password, salt);
  return `scrypt$${salt}$${key.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const [scheme, salt, hex] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hex) return false;
  const expected = Buffer.from(hex, 'hex');
  const actual = await scryptAsync(password, salt);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/* ------------------------------------------------------------------ *
 * 其它
 * ------------------------------------------------------------------ */

export function slugifyUsername(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '')
    .slice(0, 24);
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

export function average(list) {
  if (!list.length) return 0;
  return list.reduce((a, b) => a + b, 0) / list.length;
}

export function median(list) {
  if (!list.length) return 0;
  const s = [...list].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function scoreDistribution(scores) {
  const buckets = Array.from({ length: 10 }, () => 0);
  for (const s of scores) {
    const n = Math.round(Number(s));
    if (n >= 1 && n <= 10) buckets[n - 1] += 1;
  }
  const max = Math.max(1, ...buckets);
  return buckets.map((count, i) => ({
    score: i + 1,
    count,
    percent: Math.round((count / max) * 100),
  }));
}
