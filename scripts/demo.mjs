import { fileURLToPath } from 'node:url';
import { Db } from '../src/lib/store.js';

if (process.env.NODE_ENV === 'production' || process.env.DATABASE_URL || process.env.DATA_DIR) {
  throw new Error('演示脚本只支持独立的默认本地 JSON 目录。');
}
const db = new Db(fileURLToPath(new URL('../data/', import.meta.url)));
await db.init();
try {
  if (db.games.all().length || db.users.all().length) throw new Error('演示目录已有作品或账号，无需再次初始化。');
  for (const [index, name, introduction] of [
    [0, '风车来信', '一封没有寄出的信，让主人公踏上寻找旧日朋友的旅程。'],
    [1, '雨声档案室', '在深夜值班时，整理每一卷与雨有关的故事。'],
    [2, '灯塔旁的书店', '在海岸小镇经营书店，听路过的人讲述远方。'],
  ]) {
    await db.games.insert({ gid: 999999910 + index, name, introduction, orgName: '虚构演示工作室', mainImg: '/img/demo-cover.webp' });
  }
  console.log('已加入三部虚构作品。运行 npm start 查看。');
} finally {
  await db.close();
}
