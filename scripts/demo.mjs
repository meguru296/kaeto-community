import { fileURLToPath } from 'node:url';
import { Db } from '../src/lib/store.js';

if (process.env.NODE_ENV === 'production' || process.env.DATABASE_URL || process.env.DATA_DIR) {
  throw new Error('演示脚本只支持独立的默认本地 JSON 目录。');
}
const db = new Db(fileURLToPath(new URL('../data/', import.meta.url)));
await db.init();
try {
  const users = db.users.all();
  const [admin] = users;
  if (users.length !== 1 || !admin.isSuperAdmin || db.games.all().length || db.checkins.all().length) {
    throw new Error('请先创建初始管理员，并在尚无作品和打卡记录的本地实例中运行演示脚本。');
  }
  for (const [index, name, introduction, status] of [
    [0, '风车来信', '一封没有寄出的信，让主人公踏上寻找旧日朋友的旅程。', 'doing'],
    [1, '雨声档案室', '在深夜值班时，整理每一卷与雨有关的故事。', 'done'],
    [2, '灯塔旁的书店', '在海岸小镇经营书店，听路过的人讲述远方。', 'wish'],
  ]) {
    const game = await db.games.insert({ gid: 999999910 + index, name, introduction, orgName: '虚构演示工作室', mainImg: '/img/demo-cover.webp' });
    await db.checkins.insert({ userId: admin.id, gameId: game.id, status, note: '' });
  }
  console.log('已加入三部虚构作品与对应的演示打卡。运行 npm start 查看。');
} finally {
  await db.close();
}
