import { communityHome } from './redesign.js';
const page = (title, description) => '<section class="empty"><h1>' + title + '</h1><p>' + description + '</p></section>';
export const selections = [];
export const bookCover = () => '';
export const imageDialog = () => '<dialog class="poster-dialog"><button type="button" data-close-poster>关闭</button><img class="poster-dialog-image" alt=""></dialog>';
export const homeCommunity = (data, card, activity) => communityHome(data, card, activity, bookCover, imageDialog);
export const festivalPage = () => page('社区活动', '运营者可以在此发布活动介绍。');
export const journalPage = () => page('社区刊物', '这里还没有发布文章。');
export const journalEntry = () => null;
export const aboutPage = () => page('关于本站', '记录视觉小说，整理作品清单，交流阅读与游玩体验。')
  + '<div data-site-video="about.video"></div><section id="gallery"><h2>社区画廊</h2>'
  + '<button type="button" data-site-gallery="sunset" data-poster="/img/demo-cover.webp" data-poster-label="示例封面">'
  + '<img data-site-image="gallery.sunset.image" src="/img/demo-cover.webp" alt="示例封面"></button></section>' + imageDialog();
