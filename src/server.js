import { validAvatar,avatarFor } from './lib/avatars.js';
import {playingWorks} from './lib/playing.js';
import {playingPage} from './playing-design.js';
import { saveStoryCard, storyCardData, storyCardWorkOption } from './lib/story-card.js';
import {storyCardPage} from './story-card-design.js';
import {BangumiCharacters} from './lib/bangumi-characters.js';
import { StoryCharacters, storyCharacterRef, storyCharacterView } from './lib/story-characters.js';
import {WorkLists} from './lib/work-lists.js';
import {listDirectory,listNew,listDetail,listEdit,listEditEntries,listMembership,listCoverOptions,listAdd,listProfileEntry,listInvitation,listRequest} from './work-lists-design.js';
import { browserAssets } from './lib/browser-assets.js';
import { pwaWorker } from './lib/pwa.js';
import { installPage } from './pwa-design.js';
import { TrafficProtection } from './lib/traffic-protection.js';
import { trafficPage } from './traffic-design.js';
import {WorkEnrichment} from './lib/work-enrichment.js';
import {WorkCorrections} from './lib/work-corrections.js';
import {workCorrectionContext} from './lib/work-correction-context.js';
import {correctionForm,correctionMine,correctionInbox,correctionDetail,correctionPublicHistory} from './work-corrections-design.js';
import {shopPage} from './shop-design.js';
import {RuntimeStatus} from './lib/runtime-status.js';
import {runtimePage,runtimePanel} from './runtime-design.js';
import {hasWorkWalkthrough,workWalkthroughPage,workWalkthroughMeta} from './work-walkthrough-design.js';
import { MusicPlayer } from './lib/music-player.js';
import { musicPlayerPage } from './music-player-design.js';
import { MusicSharing, musicFault } from './lib/music-sharing.js';
import { MusicSource } from './lib/music-source.js';
import { musicSharingPage, musicSharePage, musicSongPage, musicPostPage, musicWorkPanel } from './music-sharing-design.js';
import { displayName, profilePatch } from './lib/identity.js';
import { Battle } from './lib/battle.js';
import { battlePage, battleClosedPage, battleCharacterPage, battleAdmin, battleVisibilityControl } from './battle-design.js';
import { battleDemo } from './battle-demo.js';
import { SiteContent, applySiteContent, isSuperAdmin } from './lib/site-content.js';
import { AnnualAnalysis } from './lib/annual-analysis.js';
import { annualAdmin, annualPage as annualAnalysisPage } from './annual-analysis.js';
import { contentAdmin, usersAdmin } from './site-admin.js';
import { submittedMemberSource } from './lib/member-sources.js';
import { rankingData } from './lib/ranking.js';
import { requestSecurity, securityHeaders, RequestLimiter } from './lib/security.js';
import { recordsFor, recordPage, saveRecord } from './lib/records.js';
import { collectionDashboard, collectionBadgeBook, collectionShelf, collectionNudge } from './member-design.js';
import { WorkMediaClient, withWorkMedia, originalCover, coverNeedsMask, protectedCoverPath, maskSource, setCoverPolicy, useWorkMediaStore, linkedVnId } from './lib/work-media.js';
import {CollectedCatalogue} from './lib/collected-catalogue.js';
import { DomesticWorks, domesticIndex } from './lib/domestic-works.js';
import { workKey } from './lib/work-key.js';
import {WorkRelations,portraitOriginal,portraitMaskFor} from './lib/work-relations.js';
import {WorkOffers,purchaseOptions,priceRegions} from './lib/work-offers.js';
import {WorkCatalogue,VnCatalogue} from './lib/work-catalogue.js';
import {BangumiCatalogue} from './lib/bangumi-catalogue.js';
import {workPresentationContext,viewerCoverLinks} from './lib/work-presentation-context.js';
import {relationPanel,appearanceCast,seriesPage,offerPanel,offerContent} from './work-connections-design.js';
import { MemberLevels,levelPanel,annualBadgePanel,levelBadge } from './lib/member-levels.js';
import { CoverImages } from './lib/cover-images.js';
import { policyPage } from './policies.js';
import { updatesPage, releaseVersion, releaseLabel, releaseNotes } from './updates.js';
import { ReviewCommunity } from './lib/review-community.js';
import { TasteDiscovery } from './lib/taste-discovery.js';
import { tasteDiscoveryPanel, tasteComparisonPage } from './taste-discovery-design.js';
import { reviewThreadPage,messagesPage } from './review-social-design.js';
import { Pilgrimage, safePilgrimageURL } from './lib/pilgrimage.js';
import { pilgrimagePage, pilgrimageCandidatesPage, pilgrimageEntry, workPilgrimage, pilgrimagePublicCollection } from './pilgrimage-design.js';
import {isSubahibiWork} from './lib/subahibi.js';
import {subahibiCharacters} from './subahibi-characters.js';
import {PilgrimageImages} from './lib/pilgrimage-images.js';
import {pilgrimageLibrary} from './pilgrimage-library.js';
import {CharacterBirthdays} from './lib/character-birthdays.js';
import {birthdayPage,birthdayHome,birthdayProfile,birthdayPublicCollection} from './character-birthdays-design.js';
import {SteamBinding} from './lib/steam-binding.js';
import {SteamProfile} from './lib/steam-profile.js';
import {BangumiImport} from './lib/bangumi-import.js';
import {steamCard,importEntry,steamAuthorizationPage,steamSettingsPage} from './external-accounts-design.js';
import {bangumiImportPage} from './bangumi-import-design.js';
import http from 'node:http';
import { getDefaultAutoSelectFamilyAttemptTimeout, setDefaultAutoSelectFamilyAttemptTimeout } from 'node:net';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {createHash} from 'node:crypto';

import { Db, databaseUrlFrom } from './lib/store.js';
import { Auth, AuthError } from './lib/auth.js';
import { Mailer } from './lib/mailer.js';
import { EmailVerification } from './lib/email-verification.js';
import { YmgalClient, YmgalError, distinctJobs } from './lib/ymgal.js';
import {
  esc,
  fmtScore,
  fromNow,
  newId,
  nowIso,
  parseCookies,
  scoreLabel,
  str,
  clampInt,
} from './lib/utils.js';
import * as views from './pages.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const MIME = {
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const MAX_BODY = 512 * 1024;

/* 登录爆破防护：同一 用户名+IP 连续失败过多则短暂锁定 */
const authFailures = new Map();
const MAX_FAILURES = 8;
const FAILURE_WINDOW = 5 * 60 * 1000;

function failureKey(req, username) {
  const ip = req.clientIp || req.socket?.remoteAddress || 'unknown';
  return `${ip}|${String(username || '').toLowerCase()}`;
}

function authLocked(req, username) {
  const key = failureKey(req, username);
  const rec = authFailures.get(key);
  if (!rec) return 0;
  if (Date.now() - rec.last > FAILURE_WINDOW) {
    authFailures.delete(key);
    return 0;
  }
  return rec.count >= MAX_FAILURES ? Math.ceil((FAILURE_WINDOW - (Date.now() - rec.last)) / 60000) : 0;
}

function noteAuthFailure(req, username) {
  const key = failureKey(req, username);
  const rec = authFailures.get(key);
  if (rec && Date.now() - rec.last <= FAILURE_WINDOW) {
    rec.count += 1;
    rec.last = Date.now();
  } else {
    authFailures.set(key, { count: 1, last: Date.now() });
  }
  if (authFailures.size > 5000) for (const [key, value] of authFailures) if (Date.now() - value.last > FAILURE_WINDOW) authFailures.delete(key);
  if (authFailures.size > 10000) authFailures.delete(authFailures.keys().next().value);
}

/* ------------------------------------------------------------------ *
 * 小工具
 * ------------------------------------------------------------------ */

function parseUrl(req) {
  return new URL(req.url, `http://${req.headers.host || 'localhost'}`);
}

async function readBody(req, limit = MAX_BODY) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, '请求体过大');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function parseForm(raw) {
  const params = new URLSearchParams(raw);
  const out = {};
  for (const [k, v] of params) out[k] = v;
  return out;
}

function redirect(res, location, cookie) {
  const headers = { Location: location };
  if (cookie) headers['Set-Cookie'] = cookie;
  res.writeHead(303, headers);
  res.end();
}

/** 若当前会话已失效，顺手让浏览器清掉旧 Cookie */
function withSessionCleanup(headers, req) {
  if (req.clearSession) {
    const existing = headers['Set-Cookie'];
    const cleared = 'gr_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
    headers['Set-Cookie'] = existing ? [].concat(existing, cleared) : cleared;
  }
  return headers;
}

function sendJson(res, status, payload, req) {
  const body = viewerCoverLinks(JSON.stringify(payload),req?.showOriginalCovers===true);
  res.writeHead(
    status,
    withSessionCleanup(
      {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
      req,
    ),
  );
  res.end(body);
}

function sendHtml(res, status, html, extraHeaders = {}, req) {
  res.writeHead(
    status,
    withSessionCleanup(
      {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        ...extraHeaders,
      },
      req,
    ),
  );
  res.end(viewerCoverLinks(html,req?.showOriginalCovers===true));
}

function flashFromUrl(url) {
  const msg = url.searchParams.get('m');
  if (!msg) return null;
  return { message: msg, kind: url.searchParams.get('mk') || 'info' };
}

function withFlash(pathname, message, kind = 'info') {
  const hashAt = pathname.indexOf('#');
  const destination = hashAt < 0 ? pathname : pathname.slice(0, hashAt);
  const hash = hashAt < 0 ? '' : pathname.slice(hashAt);
  const sep = destination.includes('?') ? '&' : '?';
  return `${destination}${sep}m=${encodeURIComponent(message)}&mk=${encodeURIComponent(kind)}${hash}`;
}

function catalogReturn(value) {
  if (typeof value !== 'string' || value.length > 600 || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f]/.test(value)) return '';
  try {
    const next = new URL(value, 'http://return.local');
    return next.origin === 'http://return.local' && /^\/(?:games|game\/(?:cn|vn|bg)?[1-9]\d{0,8}|pilgrimage|me\/pilgrimage|me\/story-card|lists(?:\/new|\/(?:invitations|requests)\/[a-f0-9]{24}|\/[a-f0-9]{24}(?:\/edit)?)?|me\/lists(?:\/add)?)$/.test(next.pathname) ? next.pathname + next.search : '';
  } catch { return ''; }
}
const catalogLogin = next => '/login?' + new URLSearchParams({ next: catalogReturn(next) || '/games' });

/** 给游戏对象挂上站内统计 */
function decorate(db, game) {
  if (!game) return null;
  const stats = db.gameStats(game.id);
  return { ...withWorkMedia(game), stats };
}

function firstLine(text, max = 90) {
  const line = String(text || '').replace(/\s+/g, ' ').trim();
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

/* ------------------------------------------------------------------ *
 * 应用
 * ------------------------------------------------------------------ */

export async function createApp({ configPath, dataDir: dataDirOverride, mailer: mailerOverride, battleClock, musicRunner } = {}) {
  // Node's 250 ms address-family fallback can abandon a working IPv4 route
  // before a cross-border TCP handshake finishes (VNDB measured ~256 ms).
  // Keep the request deadlines, but allow the initial address more time.
  setDefaultAutoSelectFamilyAttemptTimeout(Math.max(1500, getDefaultAutoSelectFamilyAttemptTimeout()));
  const configFile = configPath || process.env.CONFIG_PATH || path.join(ROOT, 'config.json');
  const config = JSON.parse(await readFile(configFile, 'utf8'));
  const dataDir = dataDirOverride || process.env.DATA_DIR || path.join(ROOT, 'data');

  // 显式传入 dataDir 的是隔离测试，始终使用临时 JSON 目录，不连接正式数据库。
  const db = new Db(dataDir, { databaseUrl: dataDirOverride ? '' : databaseUrlFrom(config) });
  const mailFile = process.env.MAIL_CONFIG_PATH || path.join(ROOT, 'config.mail.local.json');
  const mailConfig = !mailerOverride && existsSync(mailFile) ? JSON.parse(await readFile(mailFile, 'utf8')) : {};
  const mailer = mailerOverride || new Mailer(mailConfig);
  const emailVerification = new EmailVerification(db, mailer);
  const auth = new Auth(db, config, emailVerification);
  const ymgal = new YmgalClient(config.ymgal, { db });
  const mediaClient = new WorkMediaClient({ enabled: !dataDirOverride });
  const coverImages = new CoverImages(dataDir);
  const searchWorks = new Map();
  let recordWrites = Promise.resolve();
  const recordStreams=new Map();
  function recordStream(user,game,form){
    if(!/^[\w-]{8,80}$/.test(form.recordStream||'')||!/^\d{1,9}$/.test(form.recordSequence||''))return null;
    const key=user.id+':'+game.id+':'+form.recordStream,sequence=Number(form.recordSequence),before=recordStreams.get(key);
    return {stale:before&&sequence<=before.sequence,commit(){recordStreams.delete(key);recordStreams.set(key,{sequence,at:Date.now()});for(const[k,v]of recordStreams)if(recordStreams.size>5000||Date.now()-v.at>3600000)recordStreams.delete(k);}};
  }
  function rememberWork(game) {
    if (!game?.gid) return game;
    searchWorks.set(String(game.gid), game);
    if (searchWorks.size > 500) searchWorks.delete(searchWorks.keys().next().value);
    return withWorkMedia(game);
  }

  const ensureInvite = Boolean(config.security?.ensureInviteOnBoot ?? false);
  const invite = await db.init({ ensureInvite: ensureInvite ? '启动时自动生成' : undefined });
  const trafficProtection = await new TrafficProtection(db).init();
  Object.defineProperty(config,'trafficProtection',{enumerable:true,get:()=>trafficProtection.view()});
  if (db.kv) await Promise.all([useWorkMediaStore(db.kv), ymgal.useStore(db.kv)]);
  const domesticWorks = new DomesticWorks(db, domesticIndex, { identify: game => ({ ...game, vndbId: game.vndbId || linkedVnId(game) }) });
  const musicPlayer = await new MusicPlayer(db).init();
  const musicSharing = await new MusicSharing(db).init();
  const musicSource = new MusicSource({ root: ROOT, curated: musicPlayer.items(), runner: musicRunner });
  ymgal.domestic = domesticWorks;
  const workRelations=new WorkRelations(db);
  const workOffers=await new WorkOffers({dataDir,kv:db.kv,apiKey:process.env.ITAD_API_KEY||''}).init();
  const vnCatalogue=await new VnCatalogue({dataDir,kv:db.kv,enabled:config.integrations?.catalogue?.enabled??!dataDirOverride}).init();
  const bangumiFile=process.env.BANGUMI_CONFIG_PATH||path.join(path.dirname(configFile),'config.bangumi.local.json');
  const bangumiSecret=!dataDirOverride&&existsSync(bangumiFile)?JSON.parse(await readFile(bangumiFile,'utf8')):{};
  const bangumiCatalogue=await new BangumiCatalogue({token:process.env.BANGUMI_CATALOGUE_TOKEN||config.integrations?.bangumiCatalogue?.accessToken||bangumiSecret.accessToken||''}).init({dataDir,kv:db.kv});
  const bangumiCharacters=new BangumiCharacters({token:bangumiCatalogue.token});
  const storyCharacters = new StoryCharacters(bangumiCharacters);
  const workCatalogue=new WorkCatalogue(db,{domestic:domesticWorks,ymgal,relations:workRelations,vndb:vnCatalogue,bangumi:bangumiCatalogue});
  ymgal.catalog=workCatalogue;
  const battle = new Battle(db, { clock: battleClock });
  const uploadDir = process.env.UPLOAD_DIR || path.join(dataDir, 'uploads');
  const content = new SiteContent(db, uploadDir);
  const annualAnalysis = new AnnualAnalysis(db);
  const memberLevels = new MemberLevels(db);
  const tasteDiscovery = new TasteDiscovery(db);
  const characterBirthdays = new CharacterBirthdays(db);
  const steam=new SteamBinding(db,{enabled:config.integrations?.steam?.enabled===true,origin:config.site.publicUrl||`http://${config.site.host||'127.0.0.1'}:${config.site.port||8787}`});
  const steamProfile=await new SteamProfile(steam,{dataDir,kv:db.kv,apiKey:process.env.STEAM_WEB_API_KEY||''}).init();
  steam.profileService=steamProfile;
  const bangumiImport=new BangumiImport(db,{enabled:config.integrations?.bangumiImport?.enabled===true});
  const pilgrimageOptions={...config.pilgrimage};
  if(pilgrimageOptions.enabled===true&&!Array.isArray(pilgrimageOptions.catalog)){
    const publicCatalog=JSON.parse(await readFile(path.join(ROOT,'src/lib/pilgrimage-catalog.json'),'utf8'));
    if(publicCatalog.version!==1||!Array.isArray(publicCatalog.books))throw Error('Invalid public pilgrimage catalog');
    pilgrimageOptions.catalog=publicCatalog.books;
  }
  const pilgrimage = new Pilgrimage(db, pilgrimageOptions);
  pilgrimage.screenshots=new PilgrimageImages({dir:path.join(dataDir,'pilgrimage-images')});
  const pilgrimagePublicLibrary=pilgrimage.enabled?pilgrimageLibrary(pilgrimage):'';
  const pilgrimageLibraryEtag='"'+createHash('sha256').update(pilgrimagePublicLibrary).digest('hex').slice(0,20)+'"';
  const limiter = new RequestLimiter();
  function requireRemote(){
    if(trafficProtection.busy)throw Object.assign(new HttpError(503,'访问较多，外部搜索与资料更新暂缓，请先浏览本站已收录的内容。'),{retryAfter:60});
  }
  function remoteBudget(req, user, bucket, limit = 20) {
    if (!user) throw new HttpError(401, '请先登录，再加载更多作品资料');
    requireRemote();
    if (!limiter.allow(`${user.id}|${bucket}`, limit) || !limiter.allow(`${req.clientIp}|${bucket}`, limit * 2)) throw new HttpError(429, '作品资料请求过于频繁，请稍后再试');
  }

  const publicDir = path.join(ROOT, 'public');
  const reviewCommunity=await new ReviewCommunity(db).init({version:releaseLabel,title:`视觉小说社区 ${releaseLabel} 版本更新`,summary:releaseNotes.map(([name])=>name).join('、')+'等内容已更新，打开日志查看详情。'});
  reviewCommunity.music=musicSharing;
  const workCorrections=await new WorkCorrections(db,{resolve:gid=>{
    const game=db.gameByGid(gid)||domesticWorks.find(gid)||bangumiCatalogue.find(gid)||vnCatalogue.localWorks().find(g=>String(g.gid)===gid)||searchWorks.get(gid);
    return game?withWorkMedia(game):null;
  }}).init();
  reviewCommunity.corrections=workCorrections;
  const collectedCatalogue=new CollectedCatalogue(db,workCorrections);
  const workLists=await new WorkLists(db,{resolve:gid=>{
    const game=db.gameByGid(gid)||domesticWorks.find(gid)||bangumiCatalogue.find(gid)||vnCatalogue.localWorks().find(g=>String(g.gid)===gid)||searchWorks.get(gid);
    return game?withWorkMedia(workCatalogue.canonical(game)):null;
  }}).init();
  const runtimeStatus=new RuntimeStatus({db,dataDir,version:releaseVersion,statusFile:process.env.OPERATIONS_STATUS_FILE||config.operations?.statusFile||(!dataDirOverride&&process.platform==='linux'?'/run/gal-rate-status/status.json':'')});
  reviewCommunity.workLists=workLists;

  /* --------------------------- 页面数据 --------------------------- */

  function trendingGames(limit = 8) {
    return rankingData(db).rows.slice(0, limit).map(row => { const game = decorate(db, row.game); return { ...game, stats: { ...game.stats, rankingScore: row.rankingScore } }; });
  }

  function hydrate(rows) {
    return rows.map((row) => ({ ...row, game: decorate(db, row.game) }));
  }

  /* --------------------------- 路由 --------------------------- */

  function integrationFailure(req,res,error,destination){
    if(!error.publicMessage||!String(req.headers.accept||'').includes('text/html'))throw error;
    return redirect(res,withFlash(destination,error.publicMessage,'error'));
  }

  function musicWorks(query = '') {
    const key = String(query).toLocaleLowerCase().replace(/\s/g, ''), rows = new Map();
    for (const candidate of [...db.games.all(), ...domesticWorks.list(), ...vnCatalogue.localWorks(), ...(query?bangumiCatalogue.search(query,300):[])]) {
      const game = withWorkMedia(workCatalogue.canonical(candidate));
      const gid = workKey(game.gid);
      if (!gid || game.identityPending || rows.has(gid)) continue;
      const names = [game.name, game.chineseName, ...(game.extensionName || []).map(item => typeof item === 'string' ? item : item.name)];
      if (key && !names.some(name => String(name || '').toLocaleLowerCase().replace(/\s/g, '').includes(key))) continue;
      rows.set(gid, { gid, title: game.chineseName || game.name || '未命名作品', original: game.name || '' });
    }
    return [...rows.values()].sort((a, b) => {
      const rank = row => [row.title, row.original].some(name => String(name).toLocaleLowerCase().replace(/\s/g, '') === key) ? 0 : 1;
      return rank(a) - rank(b);
    });
  }
  function musicWork(gid) {
    if(String(gid).startsWith('bg')){const game=bangumiCatalogue.find(workKey(gid));if(game){const candidate=workCatalogue.canonical(game);if(!candidate.identityPending)return {gid:String(candidate.gid),title:candidate.chineseName||candidate.name,original:candidate.name};}}
    const work = musicWorks().find(item => item.gid === workKey(gid));
    if (!work) throw musicFault('关联作品已不可用，请重新选择作品库中的作品');
    return work;
  }

  function storyWork(gid) {
    const game = db.gameByGid(gid) || domesticWorks.find(gid) || bangumiCatalogue.find(gid) ||
      vnCatalogue.localWorks().find(work => String(work.gid) === gid);
    if (!game) return null;
    const canonical = workCatalogue.canonical(game);
    return canonical.identityPending ? null : withWorkMedia(canonical);
  }

  function searchStoryWorks(query) {
    const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
    const needle = normalize(query);
    if (!needle) return [];
    const matches = [];
    const candidates = [...db.games.all(), ...domesticWorks.list(), ...vnCatalogue.localWorks(), ...bangumiCatalogue.search(query, 80)];
    for (const game of candidates) {
      const names = [game.chineseName, game.name, ...(game.extensionName || []).map(alias => alias?.name || alias)].map(normalize);
      if (names.some(name => name.includes(needle)) || String(game.gid) === needle) {
        matches.push({ game, rank: names.includes(needle) || String(game.gid) === needle ? 0 : 1 });
      }
    }
    const rows = new Map();
    for (const { game } of matches.sort((a, b) => a.rank - b.rank)) {
      const resolved = storyWork(String(game.gid));
      if (resolved) rows.set(String(resolved.gid), storyCardWorkOption(resolved));
      if (rows.size >= 20) break;
    }
    return [...rows.values()];
  }


  function localRelated(game){return game.developerId?db.games.all().filter(g=>g.developerId===game.developerId&&String(g.gid)!==String(game.gid)).slice(0,8).map(g=>decorate(db,g)):[];}
  function workBody(game,user,url,related=localRelated(game)){
      related=related.map(withWorkMedia);
      const stats = db.gameStats(game.id);
      const reviews = db.reviewsForGame(game.id).map((r) => ({ ...r, user: db.users.get(r.userId) }));
      const myRating = user ? db.ratingFor(user.id, game.id) : null;
      const myReview = user ? db.reviewForUser(user.id, game.id) : null;
      const myCheckins = user ? db.checkinsForUser(user.id, game.id) : [];
      const ratings = stats.ratings.map((r) => ({ ...r, user: db.users.get(r.userId) }));

      const workMeta = {
        jobs: distinctJobs(game.staff),
        currentStatus: myCheckins[0]?.status || '',
      };

      const decoratedGame = { ...withWorkMedia(game), stats };
      const connections=workRelations.view(decoratedGame);
      return views.pageGame({
        game: decoratedGame,
        stats: { ...stats, ratings },
        ratings,
        reviews,
        myRating,
        myReview,
        myCheckins,
        related,
        user,
        workMeta,
        pilgrimage: workPilgrimage(pilgrimage, decoratedGame, user),
        connections:relationPanel(connections),
        appearances:isSubahibiWork(decoratedGame)?subahibiCharacters(connections,decoratedGame,Boolean(user)):appearanceCast(connections,Boolean(user)),
        offers:offerPanel(decoratedGame,purchaseOptions(decoratedGame,workRelations.steamLinks(decoratedGame)),workOffers),
        reviewCommunity,
        music: musicWorkPanel({ rows:musicSharing.forWork(workCatalogue.canonical(decoratedGame).gid), work:{gid:workCatalogue.canonical(decoratedGame).gid,title:decoratedGame.chineseName||decoratedGame.name},user }),
        returnTo: (() => { const value = str(url.searchParams.get('return'), 400); return /^\/(?:me|u\/[^?]+)(?:\?|#|$)/.test(value) && !value.startsWith('//') ? value : ''; })(),
      });
  }
  const workEnrichment=new WorkEnrichment(async gid=>{
    let game=db.gameByGid(gid)||domesticWorks.find(gid)||searchWorks.get(gid);
    if(!game)throw Error('Missing work');
    if(gid.startsWith('bg')&&bangumiCatalogue.token){const detail=await bangumiCatalogue.detail(gid);if(detail?.introduction&&!game.introduction){const stored=db.gameByGid(gid);if(stored)game=await db.games.update(stored.id,{introduction:detail.introduction});}}
    if(!game.introduction&&/^\d+$/.test(gid)&&!trafficProtection.busy)game=await ymgal.getGame(gid)||game;
    const related=localRelated(game),jobs=[];let remoteRelated=related;
    if(mediaClient.needsResolve(game)&&!game.domestic&&!trafficProtection.busy)jobs.push(mediaClient.resolve(game));
    if(!game.orgName&&game.developerId&&!dataDirOverride&&!trafficProtection.busy)jobs.push(ymgal.organization(game.developerId).then(async brand=>{const current=db.gameByGid(gid);if(brand&&current&&!current.orgName&&current.developerId===game.developerId)await db.games.update(current.id,{orgName:brand});}));
    if(game.developerId&&related.length<3&&!dataDirOverride&&!trafficProtection.busy)jobs.push(ymgal.gamesByOrg(game.developerId).then(rows=>{remoteRelated=rows.filter(g=>String(g.gid)!==gid).slice(0,8).map(game=>{rememberWork(game);return game;});}));
    await Promise.allSettled(jobs);return {related:remoteRelated};
  });

  async function handlePage(req, res, url, ctx) {
    const { user } = ctx;
    const pathname = url.pathname;

    const render = (status, title, body, active, extra = {}) => {
      const html = applySiteContent(views.layout({
        config,
        user,
        title,
        body,
        active,
        bodyClass: extra.bodyClass || '',
        battleVisible: battle.canView(user),
      }), content.values());
      sendHtml(res, status, html, {}, req);
    };

    if (pathname === '/healthz') return sendJson(res, 200, { status: 'ok', version: releaseVersion }, req);
    const listMembershipRoute=pathname.match(/^\/api\/lists\/([a-f0-9]{24})\/membership$/);
    if(listMembershipRoute){
      if(!user)throw new HttpError(401,'请先登录');
      if(!limiter.allow(user.id+'|work-lists-membership',120))throw new HttpError(429,'状态刷新过于频繁，请稍后重试');
      return sendJson(res,200,listMembership(workLists,workLists.get(listMembershipRoute[1],user,{edit:true})),req);
    }
    const memberSearchRoute=pathname.match(/^\/api\/lists\/([a-f0-9]{24})\/members\/search$/);
    if(memberSearchRoute){if(!user)throw new HttpError(401,'请先登录');if(!limiter.allow(user.id+'|list-member-search',90))throw new HttpError(429,'搜索较多，请稍后再试');const rows=workLists.searchMembers(memberSearchRoute[1],user,url.searchParams.get('q')).map(({avatarId,...u})=>({...u,avatar:avatarFor({avatarId})}));return sendJson(res,200,{members:rows},req);}
    if(pathname==='/lists'||pathname==='/me/lists'){
      const mine=pathname==='/me/lists';if(mine&&!user)return redirect(res,catalogLogin(pathname));
      const author=url.searchParams.get('author');let authorId='';
      if(!mine&&author){const member=/^[1-9]\d{0,14}$/.test(author)&&db.userByUid(author);if(!member)throw new HttpError(404,'没有找到这位群友');authorId=member.id;}
      return render(200,mine?'我的列表':'列表',views.flashBlock(flashFromUrl(url))+listDirectory(workLists,user,url.searchParams,{mine,authorId}),'lists',{bodyClass:'work-lists-page'});
    }
    if(pathname==='/lists/new'||pathname==='/me/lists/add'){
      res.setHeader('X-Robots-Tag','noindex, nofollow');
      if(!user)return redirect(res,catalogLogin(pathname+url.search));
      const gid=url.searchParams.get('gid')||'',game=gid?workLists.work(gid):null;
      if(pathname==='/me/lists/add'&&!game)throw new HttpError(400,'请从作品详情选择要加入的作品');
      const body=pathname==='/lists/new'?listNew({gid:game?String(game.gid):'',game}):listAdd(workLists,user,game);
      return render(200,pathname==='/lists/new'?'创建作品清单':'加入作品清单',views.flashBlock(flashFromUrl(url))+body,'lists',{bodyClass:'work-lists-page'});
    }
    const invitationRoute=pathname.match(/^\/lists\/invitations\/([a-f0-9]{24})$/);
    if(invitationRoute){if(!user)return redirect(res,catalogLogin(pathname));res.setHeader('X-Robots-Tag','noindex, nofollow');return render(200,'清单协作邀请',listInvitation(workLists,invitationRoute[1],user),'lists',{bodyClass:'work-lists-page'});}
    const requestRoute=pathname.match(/^\/lists\/requests\/([a-f0-9]{24})$/);
    if(requestRoute){if(!user)return redirect(res,catalogLogin(pathname));res.setHeader('X-Robots-Tag','noindex, nofollow');return render(200,'清单协作申请',listRequest(workLists,requestRoute[1],user),'lists',{bodyClass:'work-lists-page'});}
    const listRoute=pathname.match(/^\/lists\/([a-f0-9]{24})(\/edit)?$/);
    if(listRoute){
      const editing=Boolean(listRoute[2]);if(editing&&!user)return redirect(res,catalogLogin(pathname+url.search));
      const row=workLists.get(listRoute[1],user,{edit:editing});
      if(editing||row.visibility==='private')res.setHeader('X-Robots-Tag','noindex, nofollow');
      let body;
      if(editing){
        const q=String(url.searchParams.get('q')||'').slice(0,100),matches=musicWorks(q);
        const searchPage=Math.max(1,Math.min(Math.max(1,Math.ceil(matches.length/12)),parseInt(url.searchParams.get('searchPage'),10)||1));
        body=listEdit(workLists,row,{params:url.searchParams,results:matches.slice((searchPage-1)*12,searchPage*12).map(w=>workLists.work(w.gid)),total:matches.length,user});
      }else body=listDetail(workLists,row,user,url.searchParams);
      return render(200,editing?'管理作品清单':row.title,views.flashBlock(flashFromUrl(url))+body,'lists',{bodyClass:'work-lists-page'});
    }
    const correctionWork=pathname.match(/^\/game\/((?:cn|vn|bg)?[1-9]\d{0,8})\/corrections\/(new|history)$/);
    if(correctionWork){
      const [,gid,mode]=correctionWork;
      const canonical=db.gameByGid(gid);
      if(canonical&&String(canonical.gid)!==gid)return redirect(res,'/game/'+canonical.gid+'/corrections/'+mode+url.search);
      if(mode==='history')return render(200,'作品校订记录',correctionPublicHistory(workCorrections,gid),'games');
      if(!user)return redirect(res,catalogLogin('/game/'+gid));
      return render(200,'提交资料纠错',views.flashBlock(flashFromUrl(url))+correctionForm(workCorrections,user,gid),'games');
    }
    if(pathname==='/me/corrections'){
      if(!user)return redirect(res,'/login');
      return render(200,'我的纠错',views.flashBlock(flashFromUrl(url))+correctionMine(workCorrections,user,{page:url.searchParams.get('page'),status:url.searchParams.get('status')}),'');
    }
    if(pathname==='/admin/corrections'){
      if(!user)return redirect(res,'/login');
      if(!workCorrections.canReview(user))throw new HttpError(403,'只有管理员可以审核纠错');
      return render(200,'资料纠错收件箱',views.flashBlock(flashFromUrl(url))+correctionInbox(workCorrections,db,{page:url.searchParams.get('page'),status:url.searchParams.get('status')||'open',q:str(url.searchParams.get('q'),100)}),'');
    }
    const correctionRecord=pathname.match(/^\/(me|admin)\/corrections\/([a-f0-9]{24})$/);
    if(correctionRecord){if(!user)return redirect(res,'/login');const admin=correctionRecord[1]==='admin',r=workCorrections.row(correctionRecord[2],user,{admin});return render(200,admin?'审核资料纠错':'纠错进度',views.flashBlock(flashFromUrl(url))+correctionDetail(workCorrections,db,user,r,{admin,siblingPage:url.searchParams.get('page')}),'');}
    if (pathname === '/install') return render(200, '安装视觉小说社区', installPage(), '');
    if (pathname === '/admin/traffic') {
      if(!user)return redirect(res,'/login');
      if(!isSuperAdmin(user))throw new HttpError(403,'只有超级管理员可以管理访问保护');
      return render(200,'访问保护',views.flashBlock(flashFromUrl(url))+trafficPage(trafficProtection,db),'');
    }
    if (pathname === '/admin/runtime' || pathname === '/api/admin/runtime') {
      if (!user) { if(pathname.startsWith('/api/'))throw new HttpError(401,'请先登录');return redirect(res,'/login'); }
      if (!isSuperAdmin(user)) throw new HttpError(403,'只有超级管理员可以查看运行状态');
      if (!limiter.allow(user.id+'|runtime-status',12)) throw new HttpError(429,'刷新过于频繁，请稍后再试');
      const snapshot=await runtimeStatus.snapshot();
      if(pathname.startsWith('/api/'))return sendJson(res,200,{html:runtimePanel(snapshot),generatedAt:snapshot.generatedAt},req);
      return render(200,'运行状态',runtimePage(snapshot),'',{bodyClass:'runtime-admin-page'});
    }
    if (pathname === '/music' && url.searchParams.has('play')) return redirect(res, '/music/selected?play=' + encodeURIComponent(str(url.searchParams.get('play'), 80)));
    if (pathname === '/music') return render(200, '音乐分享', views.flashBlock(flashFromUrl(url)) + musicSharingPage({ data: musicSharing.view({ user, tab: url.searchParams.get('tab'), q: url.searchParams.get('q'), role: url.searchParams.get('role'), sort:url.searchParams.get('sort'), page: url.searchParams.get('page') }), user, highlights:musicSharing.highlights(user) }), 'music');
    if (pathname === '/music/selected') return render(200, '精选试听', views.flashBlock(flashFromUrl(url)) + musicPlayerPage({ player: musicPlayer, user, selected: str(url.searchParams.get('play'), 80) }), 'music');
    if (pathname === '/music/share') {
      if (!user) return redirect(res, '/login');
      const editId = str(url.searchParams.get('edit'), 80), post = editId ? musicSharing.post(editId) : null;
      if (editId && !post) throw new HttpError(404, '这条推荐已不存在');
      if (post && post.userId !== user.id) throw new HttpError(403, '只能编辑自己的推荐');
      const song = musicSharing.song(post?.songId || str(url.searchParams.get('song'), 100));
      const owned = !post && song ? musicSharing.owned(user.id,song.id) : null;
      return render(200, post ? '编辑音乐推荐' : '分享音乐', musicSharePage({ user, post, song, owned, work:!post && workKey(url.searchParams.get('work'))?musicWork(url.searchParams.get('work')):null }), 'music');
    }
    if (pathname === '/api/music/search' || pathname === '/api/music/works') {
      if (!user) throw new HttpError(401, '请先登录，再搜索并分享音乐');
      if (req.method !== 'GET') throw new HttpError(405, '请使用歌曲搜索入口');
      const songSearch = pathname === '/api/music/search';
      if(songSearch)requireRemote();
      if (!limiter.allow(user.id + (songSearch ? '|music-search' : '|music-work'), songSearch ? 10 : 30) || !limiter.allow(req.clientIp + '|music-search-all', 60)) throw new HttpError(429, '搜索过于频繁，请稍后再试');
      const q = str(url.searchParams.get('q'), 100).trim();
      if (!q) throw new HttpError(400, '请输入搜索关键词');
      if (songSearch) musicSource.curated = musicPlayer.items();
      if (!songSearch) return sendJson(res,200,{rows:musicWorks(q).slice(0,25)},req);
      const offsetText=url.searchParams.get('offset') || '0';
      if(!/^\d{1,3}$/.test(offsetText))throw new HttpError(400,'歌曲搜索分页无效');
      const result=await musicSource.search(q,user.id,ctx.sessionId,Number(offsetText));
      if(result.source!=='netease' && !result.offset) {
        const match=q.toLocaleLowerCase(),known=musicSharing.state.songs.filter(s=>[s.title,s.album,...s.artists].some(v=>v.toLocaleLowerCase().includes(match)));
        const seen=new Set(result.rows.map(r=>r.song.id));
        for(const song of known)if(!seen.has(song.id)){result.rows.push(musicSource.stage(song,user.id,ctx.sessionId));seen.add(song.id);}
        if(known.length)result.notice+='；以下包含已收录的歌曲';
      }
      for(const row of result.rows){const owned=musicSharing.owned(user.id,row.song.id);if(owned)row.editUrl='/music/share?edit='+owned.id;}
      return sendJson(res,200,result,req);
    }
    const musicSongMatch = pathname.match(/^\/music\/song\/([a-zA-Z0-9-]{1,100})$/);
    if (musicSongMatch) {
      const song = musicSharing.song(musicSongMatch[1]); if (!song) throw new HttpError(404, '这首歌尚未收录');
      return render(200, song.title + ' · 音乐推荐', musicSongPage({ song, supporters:musicSharing.supporters(song.id), works:musicSharing.worksForSong(song.id), owned:user?musicSharing.owned(user.id,song.id):null, data: musicSharing.view({ songId: song.id, user, page: url.searchParams.get('page') }), user }), 'music');
    }
    const musicPostMatch = pathname.match(/^\/music\/post\/([a-f0-9]{24})$/);
    if (musicPostMatch) {
      const post = musicSharing.post(musicPostMatch[1]); if (!post) throw new HttpError(404, '这条音乐推荐已不存在');
      const song = musicSharing.song(post.songId), likes = musicSharing.state.likes.filter(item => item.postId === post.id);
      return render(200, song.title + ' · 群友推荐', musicPostPage({ row: { post, song, ...musicSharing.recommendation(song.id,user?.id), member: db.users.get(post.userId), likes: likes.length, liked: likes.some(item => item.userId === user?.id) }, user, thread:musicSharing.thread(post.id,url.searchParams.get('page')) }), 'music');
    }
    if(pathname==='/messages'){
      if(!user)return redirect(res,'/login');
      return render(200,'消息中心',views.flashBlock(flashFromUrl(url))+messagesPage({...reviewCommunity.inbox(user.id,{type:url.searchParams.get('type'),page:url.searchParams.get('page')}),correctionReview:workCorrections.reviewEntry(user.id)}),'');
    }
    if(pathname==='/api/notifications/unread'){
      if(!user)throw new HttpError(401,'请先登录');
      if(!limiter.allow(user.id+'|notifications-read',30))throw new HttpError(429,'请稍后再查看消息');
      return sendJson(res,200,{unread:reviewCommunity.unread(user.id)},req);
    }
    const reviewThreadMatch=pathname.match(/^\/reviews\/([a-zA-Z0-9_-]{1,80})$/);
    if(reviewThreadMatch){
      const review=reviewCommunity.review(reviewThreadMatch[1]),game=db.games.get(review.gameId),view=reviewCommunity.view(review.id,user?.id,{page:url.searchParams.get('page'),size:20});
      return render(200,'作品讨论',views.flashBlock(flashFromUrl(url))+reviewThreadPage({review:{...review,user:db.users.get(review.userId)},game,view,user}),'games');
    }
    if(pathname==='/admin/integrations/steam'){
      if(!user)return redirect(res,'/login');
      if(!isSuperAdmin(user))throw new HttpError(403,'只有超级管理员可以配置 Steam 资料接口');
      return render(200,'Steam 资料接口',views.flashBlock(flashFromUrl(url))+steamSettingsPage(steamProfile),'');
    }
    if(pathname==='/api/me/steam-card'){
      if(!user)throw new HttpError(401,'请先登录');
      if(!limiter.allow(user.id+'|steam-card',60))throw new HttpError(429,'请稍后再更新卡片');
      return sendJson(res,200,{html:steamCard(steam,user,true),busy:steamProfile.view(user.id)?.busy||false},req);
    }
    if(pathname==='/api/steam/connect')return redirect(res,'/me');
    if(['/api/import/bangumi/preview','/api/import/bangumi/apply'].includes(pathname))return redirect(res,'/me/import/bangumi');
    if(pathname==='/me/steam'){
      if(!user)return redirect(res,'/login');
      try{return render(200,'Steam 账号验证',steamAuthorizationPage(steam.authorization(user,ctx.sessionId,url.searchParams.get('state'))),'');}
      catch(error){return integrationFailure(req,res,error,'/me');}
    }
    if(pathname==='/account/steam/callback'){
      if(!user)throw new HttpError(401,'请登录网站后重新开始 Steam 绑定');
      try{await steam.complete(user,ctx.sessionId,url.searchParams);}
      catch(error){return integrationFailure(req,res,error,'/me');}
      if(steamProfile.configured&&!trafficProtection.busy)Promise.resolve().then(()=>steamProfile.refresh(user)).catch(()=>{});
      return redirect(res,withFlash('/me','Steam 账号已通过官方验证并绑定。','ok'));
    }
    if(pathname==='/me/import/bangumi'){
      if(!bangumiImport.enabled)throw new HttpError(404,'记录导入暂未开放');
      if(!user)return redirect(res,'/login');
      const token=url.searchParams.get('preview')||url.searchParams.get('result');let stage=null,notice='';
      if(token){try{stage=bangumiImport.stage(user,ctx.sessionId,token);}catch(error){if(error.status!==403)throw error;notice='<p class="bi-status" role="status">预览已过期，请重新读取公开记录。</p>';}}
      return render(200,'导入 Bangumi 记录',views.flashBlock(flashFromUrl(url))+notice+bangumiImportPage(bangumiImport,user,url.searchParams.has('preview')?stage:null,url.searchParams.has('result')?stage?.result:null,str(url.searchParams.get('username'),180)),'');
    }
    if(pathname==='/birthdays'){
      if(url.searchParams.get('mine')==='1'&&!user)return redirect(res,catalogLogin('/birthdays?mine=1'));
      const previewNote=config.pilgrimage?.preview===true?'<p class="cb-preview">本地预览 · 收藏保存在本地体验账号，确认设计后再上线。</p>':'';
      return render(200,'角色生日簿',previewNote+birthdayPage(characterBirthdays,user,url.searchParams),'',{bodyClass:'birthday-page'});
    }
    if(pathname==='/api/pilgrimage/screenshot'){
      if(!pilgrimage.enabled)throw new HttpError(404,'巡礼手账尚未开放');
      const book=pilgrimage.books.find(b=>b.subjectId===Number(url.searchParams.get('subject'))),point=book?.points.find(p=>p.id===url.searchParams.get('point'));
      if(!point)throw new HttpError(404,'这处地点尚未收录');
      if(!limiter.allow(`${req.clientIp}|pilgrimage-screenshot`,30))throw new HttpError(429,'请稍后再准备截图');
      const bytes=await pilgrimage.screenshots.screenshot(point);
      res.writeHead(200,{'Content-Type':'image/webp','Content-Length':bytes.length,'Cache-Control':'public, max-age=3600'});
      return res.end(req.method==='HEAD'?undefined:bytes);
    }
    if(pathname==='/pilgrimage/works'){
      if(!pilgrimage.enabled)throw new HttpError(404,'巡礼手账尚未开放');
      return render(200,'巡礼作品集',pilgrimageCandidatesPage(pilgrimage,url.searchParams),'pilgrimage',{bodyClass:'pilgrimage-page'});
    }
    if (pathname === '/pilgrimage' || pathname === '/me/pilgrimage') {
      if(!pilgrimage.enabled)throw new HttpError(404,'巡礼手账尚未开放');
      if(pathname==='/me/pilgrimage'&&!user)return redirect(res,catalogLogin('/me/pilgrimage'));
      return render(200,'巡礼手账',views.flashBlock(flashFromUrl(url))+pilgrimagePage(pilgrimage,user,url.searchParams),'pilgrimage',{bodyClass:'pilgrimage-page'});
    }
    if (pathname === '/policies' || pathname === '/policies/privacy' || pathname === '/policies/disclaimer') {
      const page = policyPage(pathname.split('/')[2] || 'terms');
      return render(200, page.title, page.body, '', { bodyClass: 'policies-page' });
    }
    if (pathname === '/api/me/story-card/works') {
      if (!user) throw new HttpError(401, '请先登录');
      if (!limiter.allow(user.id + '|story-card-search', 60)) throw new HttpError(429, '搜索过于频繁，请稍后再试');
      return sendJson(res, 200, { rows: searchStoryWorks(str(url.searchParams.get('q'), 100)) }, req);
    }
    if(pathname==='/api/me/story-card/characters'){
      remoteBudget(req,user,'story-characters',30);
      return sendJson(res, 200, await storyCharacters.search(str(url.searchParams.get('q'), 80),
        Number(url.searchParams.get('page') || 1), url.searchParams.get('source') ?? 'bangumi'), req);
    }
    const cardCharacter = pathname.match(/^\/api\/me\/story-card\/(character|character-image)\/([^/]+)$/);
    if (cardCharacter) {
      if (!user) throw new HttpError(401, '请先登录');
      const key = cardCharacter[2];
      const ref = storyCharacterRef(/^[1-9]\d{0,8}$/.test(key) ? Number(key) : key);
      if (!ref) throw new HttpError(404, '角色资料不存在');
      if (cardCharacter[1] === 'character') {
        remoteBudget(req, user, 'story-character-detail', 30);
        const character = await storyCharacters.character(ref, { subjects: true });
        return sendJson(res, 200, { character: storyCharacterView(ref, character) }, req);
      }
      if (!limiter.allow(user.id + '|story-character-image', 120)) throw new HttpError(429, '图片请求较多，请稍后重试');
      let bytes;
      try {
        bytes = await storyCharacters.image(ref, user.showOriginalCovers === true);
      } catch (error) {
        throw new HttpError(error.status || 404, '角色图片暂不可用，卡片将保留名称占位');
      }
      res.writeHead(200, { 'Content-Type': 'image/webp', 'Content-Length': bytes.length, 'Cache-Control': 'private, no-store', Vary: 'Cookie' });
      return res.end(req.method === 'HEAD' ? undefined : bytes);
    }
    const storyCover=pathname.match(/^\/api\/me\/story-card\/cover\/((?:cn|vn|bg)?[1-9]\d{0,8})$/);
    if(storyCover){
      if(!user)throw new HttpError(401,'请先登录');
      const game=storyWork(storyCover[1]);if(!game)throw new HttpError(404,'作品封面暂不可用');
      if(!limiter.allow(user.id+'|story-card-cover',120))throw new HttpError(429,'封面请求较多，请稍后重试');
      const cover=originalCover(game);
      let image;try{image=game.coverRestricted&&user.showOriginalCovers!==true?{mime:'image/webp',bytes:await coverImages.masked(cover)}:await coverImages.original(cover);}catch{throw new HttpError(404,'封面暂不可用，卡片将保留名称占位');}
      res.writeHead(200,{'Content-Type':image.mime,'Content-Length':image.bytes.length,'Cache-Control':'private, no-store',Vary:'Cookie'});return res.end(req.method==='HEAD'?undefined:image.bytes);
    }
    const displayCover=pathname.match(/^\/api\/cover\/display\/([a-f0-9]{20})\.webp$/);
    if(displayCover){
      if(!user)throw new HttpError(401,'请先登录');
      if(user.showOriginalCovers!==true)throw new HttpError(403,'请先在账号菜单开启原封面显示');
      if(!limiter.allow(user.id+'|cover-display',240))throw new HttpError(429,'图片请求过于频繁');
      const cover=maskSource('/img/cover-masks/'+displayCover[1]+'.webp',db.games.all());if(!cover)throw new HttpError(404,'封面暂不可用');
      const image=await coverImages.original(cover);res.writeHead(200,{'Content-Type':image.mime,'Content-Length':image.bytes.length,'Cache-Control':'private, no-store',Vary:'Cookie'});return res.end(req.method==='HEAD'?undefined:image.bytes);
    }
    const originalMatch = pathname.match(/^\/api\/cover\/original\/((?:cn|vn|bg)?[1-9]\d{0,8})$/);
    const portraitMatch=pathname.match(/^\/api\/character-portrait\/(vndb-c[1-9]\d{0,8})$/);
    if(portraitMatch){
      if(!user)throw new HttpError(401,'请先登录，再查看角色图片');
      if(!limiter.allow(req.clientIp+'|character-portrait',40))throw new HttpError(429,'图片请求过于频繁，请稍后再试');
      const source=portraitOriginal(portraitMatch[1]);if(!source)throw new HttpError(404,'这个角色图仅提供遮挡版本');
      const image=await coverImages.original({url:source});res.writeHead(200,{'Content-Type':image.mime,'Content-Length':image.bytes.length,'Cache-Control':'private, no-store',Vary:'Cookie'});return res.end(req.method==='HEAD'?undefined:image.bytes);
    }
    if (originalMatch) {
      if (!user) throw new HttpError(401, '请先登录，再点击查看原图');
      if (!limiter.allow(`${req.clientIp}|cover-original`, 40)) throw new HttpError(429, '封面请求过于频繁，请稍后再试');
      const game = db.gameByGid(originalMatch[1]) || searchWorks.get(originalMatch[1]);
      if (!game) throw new HttpError(404, '未找到作品');
      let image;
      try { image = await coverImages.original(originalCover(game)); }
      catch { throw new HttpError(404, '封面暂时不可用'); }
      res.writeHead(200, { 'Content-Type': image.mime, 'Content-Length': image.bytes.length, 'Cache-Control': 'private, no-store', Vary: 'Cookie' });
      return res.end(req.method === 'HEAD' ? undefined : image.bytes);
    }
    if (pathname === '/admin/site' || pathname === '/admin/users') {
      if (!user) return redirect(res, '/login');
      if (!isSuperAdmin(user)) throw new HttpError(403, '只有超级管理员可以访问');
      const body = pathname === '/admin/users' ? usersAdmin(db) : contentAdmin({ content, assets: db.assets.all().slice(-60).reverse(), audit: db.audit.all().slice(-30).reverse() });
      return render(200, pathname === '/admin/users' ? '成员管理' : '内容与素材', views.flashBlock(flashFromUrl(url)) + body, '', { bodyClass: 'site-admin-page' });
    }

    if (pathname === '/' || pathname === '/index.html') {
      const stats = db.siteStats();
      const activity = db.recentActivity(12).map((a) => ({
        ...a,
        user: db.users.get(a.userId),
        game: db.games.get(a.gameId),
        data: a.kind === 'rating' ? a.score : a.kind === 'checkin' ? a.status : a.text,
      }));
      let trending = trendingGames(8);
      const recentGames = db.collectedGames()
        .slice(0, 8)
        .map((g) => decorate(db, g));

      if (!trending.length) trending = recentGames;
      const playing = playingWorks(db,decorate).slice(0,6);
      const reviews = db.reviews.all().slice()
        .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))
        .slice(0, 3).map((r) => ({ ...r, user: db.users.get(r.userId), game: db.games.get(r.gameId), score: db.ratingFor(r.userId, r.gameId)?.score }));

      const body = views.pageHome({
        config,
        birthdayEntry: birthdayHome(characterBirthdays,user),
        battleVisible: battle.canView(user),
        stats,
        trending,
        recentGames,
        activity,
        playing,
        reviews,
      });
      return render(200, '', body, 'home', { bodyClass: 'home-page' });
    }

    if (pathname === '/shop') {
      return render(200, '星标喫茶屋 · 通贩图录', shopPage({category:url.searchParams.get('category')}), 'shop', {bodyClass:'shop-page'});
    }
    if (pathname === '/annual/2025') {
      return render(200, '十二江器 · 2025', views.pageAnnual(), 'annual', { bodyClass: 'annual-page' });
    }

    if (pathname === '/festival/2027/details') {
      return render(200, '拜年祭 · 活动介绍与投稿指南', views.pageFestivalDetails(), 'festival', { bodyClass: 'festival-details-page' });
    }
    if(pathname==='/api/work-detail'){
      if(!user)throw new HttpError(401,'请先登录');
      const gid=workKey(url.searchParams.get('gid')),game=db.gameByGid(gid)||domesticWorks.find(gid)||searchWorks.get(gid);
      if(!game)throw new HttpError(404,'未找到作品');
      if(!limiter.allow(user.id+'|work-detail-poll',60))throw new HttpError(429,'请求过于频繁');
      requireRemote();
      const job=workEnrichment.request(String(game.gid),()=>remoteBudget(req,user,'work-detail-enrich',12));
      const latest=db.gameByGid(gid)||domesticWorks.find(gid)||game;
      return sendJson(res,200,{state:job.state,...(job.state==='ready'?{html:workBody(withWorkMedia(latest),user,new URL('/game/'+gid,url),job.result.related)}:{})},req);
    }
    if (pathname === '/api/work-media') {
      const gid = workKey(url.searchParams.get('gid'));
      const game = db.gameByGid(gid) || searchWorks.get(gid);
      if (!game) return sendJson(res, 404, { error: '未找到作品' }, req);
      const known = withWorkMedia(game);
      let enriched = known;
      if (mediaClient.needsResolve(game) && user && !game.domestic && !trafficProtection.busy) {
        try { if(mediaClient.willResolve(game)) remoteBudget(req,user,'work-media',40); enriched=await mediaClient.resolve(game); }
        catch(error) { if(error.status!==429) throw error; enriched={...known,mediaStatus:'rate-limited'}; }
      } else if (!known.media) enriched = { ...known, mediaStatus: trafficProtection.busy?'busy':'login-required' };
      return sendJson(res, 200, { cover: enriched.mainImg || '', masked: enriched.coverRestricted, brand: enriched.orgName || '', source: enriched.coverSource === 'vndb' ? enriched.media.source : enriched.mainImg ? enriched.ymgalUrl || `https://www.ymgal.games/ga${enriched.gid}` : '', status: enriched.mediaStatus || 'ready' }, req);
    }
    if(pathname==='/api/work-offers'){
      const gid=workKey(url.searchParams.get('gid')),country=url.searchParams.get('country')||'CN',appid=url.searchParams.get('appid');
      if(!gid||!priceRegions[country])return sendJson(res,400,{error:'作品或价格地区无效'},req);
      const game=db.gameByGid(gid)||domesticWorks.find(gid)||searchWorks.get(gid);
      if(!game)return sendJson(res,404,{error:'未找到作品'},req);
      const options=purchaseOptions(withWorkMedia(game),workRelations.steamLinks(game));
      if(!options.some(o=>o.appid===appid))return sendJson(res,400,{error:'没有对应的正式发行版本'},req);
      if(!limiter.allow(req.clientIp+'|work-offers',30))return sendJson(res,429,{error:'价格查询过于频繁，请稍后再试'},req);
      const view=trafficProtection.busy?workOffers.view(appid,country):await workOffers.refresh(appid,country);
      return sendJson(res,200,{html:offerContent(view)},req);
    }
    const seriesMatch=pathname.match(/^\/series\/(v[1-9]\d{0,8})$/);
    if(seriesMatch){const page=seriesPage(workRelations,seriesMatch[1],url.searchParams);return page?render(200,page.title,page.body,'games'):render(404,'系列资料暂缺',views.pageError({status:404,message:'暂未收录这个系列的关系资料。'}),'games');}
    if (pathname === '/festival/2027') {
      return render(200, '2027 视觉小说拜年祭', views.pageFestival(), 'festival', { bodyClass: 'festival-page' });
    }
    if (pathname === '/journal') {
      return render(200, '群刊精选', views.pageJournal(), 'journal', { bodyClass: 'journal-page' });
    }
    if (pathname.startsWith('/journal/')) {
      const entry = views.pageJournalEntry(pathname.slice('/journal/'.length));
      if (!entry) return render(404, '未找到精选内容', '<section class="empty"><h1>这一页还没有收录。</h1><a class="btn btn-primary" href="/journal">返回群刊精选</a></section>', 'journal');
      return render(200, entry.title, entry.body, 'journal', { bodyClass: 'reader-page' });
    }
    if (pathname === '/updates') return render(200, '更新日志 · '+releaseLabel, updatesPage({preview:config.pilgrimage?.preview===true}), '', { bodyClass: 'updates-page-body' });
    if (pathname === '/about') {
      return render(200, '关于交流会与星标', views.pageAbout(), 'about', { bodyClass: 'about-page' });
    }

    if (pathname === '/battle/demo' || /^\/battle\/demo\/character\/c\d+$/.test(pathname)) {
      if (!isSuperAdmin(user)) throw new HttpError(403, '模拟赛仅超级管理员可查看');
      const demo = await battleDemo({ stage:url.searchParams.get('stage'), characterId:pathname.split('/')[3]==='character'?pathname.split('/')[4]:null, round:url.searchParams.get('round'), page:url.searchParams.get('page') });
      if (!demo) return render(404,'角色不存在',views.pageError({status:404,message:'模拟赛中没有这位角色。'}),'battle');
      return render(200,demo.title,demo.body,'battle',{bodyClass:'battle-page battle-demo-page'});
    }
    if(pathname==='/battle'&&battle.event().publicVisible!==true){
      return render(200,'萌战尚未开放',battleClosedPage(user),'battle',{bodyClass:'battle-closed-page'});
    }
    if ((pathname === '/battle' || pathname.startsWith('/battle/')) && !battle.canView(user)) {
      return render(404, '活动尚未开放', views.pageError({ status: 404, message: '萌战活动尚未开放。' }), '');
    }
    if (pathname === '/battle') {
      const flash = flashFromUrl(url);
      return render(200, '萌战', (flash ? views.flashBlock(flash) : '') + (isSuperAdmin(user) ? '<aside class="mb-demo-entry"><div><strong>先看看一场完整的萌战。</strong><span>截图阵容模拟赛 · 可回看五轮投票、晋级和应援</span></div><a class="btn" href="/battle/demo">查看模拟赛 →</a></aside>' : '') + battlePage({ data: battle.view(user?.id), user, round: url.searchParams.get('round'), cheers: battle.cheers(null, url.searchParams.get('page')) }), 'battle', { bodyClass: 'battle-page' });
    }
    const characterMatch = pathname.match(/^\/battle\/character\/(c\d+)$/);
    if (characterMatch) {
      const data = battle.view(user?.id);
      const character = data.event.characters.find(c => c.id === characterMatch[1] && c.name);
      if (!character) return render(404, '角色未公布', views.pageError({ status: 404, message: '这位角色尚未公布，先到萌战页看看吧。' }), 'battle');
      const flash = flashFromUrl(url);
      return render(200, character.name + ' · 萌战应援', (flash ? views.flashBlock(flash) : '') + battleCharacterPage({ data, character, user, cheers: battle.cheers(character.id, url.searchParams.get('page')) }), 'battle', { bodyClass: 'battle-character-page' });
    }
    if (pathname === '/admin/battle') {
      if (!user) return redirect(res, '/login');
      if (!user.isAdmin) return render(403, '无权访问', views.pageError({ status: 403, message: '只有站长可以配置活动。' }), '');
      const flash = flashFromUrl(url);
      return render(200, '萌战工作台', (flash ? views.flashBlock(flash) : '') + battleAdmin({ data: battle.view(user.id), user }), 'battle', { bodyClass: 'battle-admin-page' });
    }

    if (pathname === '/playing') {
      return render(200,'群友最近在玩',playingPage(playingWorks(db,decorate,url.searchParams.get('sort')),url.searchParams,views.gameCard,views.pagination),'games',{bodyClass:'catalog-page playing-page-body'});
    }
    if (pathname === '/games') {
      const q = str(url.searchParams.get('q'), 95);
      const domesticOnly = url.searchParams.get('domestic') === '1';
      const domesticCatalog = url.searchParams.get('origin') === 'cn';
      const unmarkedOnly = !domesticCatalog && url.searchParams.get('scope') !== 'all' && url.searchParams.get('unmarked') === '1';
      if (unmarkedOnly && !user) return redirect(res, catalogLogin(url.pathname + url.search));
      const wantsLocal = url.searchParams.get('scope') !== 'all' && (unmarkedOnly || url.searchParams.get('local') === '1' || Boolean(url.searchParams.get('brand') || url.searchParams.get('writer')));
      if (!user && url.searchParams.get('scope') === 'all' && !domesticCatalog && !trafficProtection.busy) return redirect(res, catalogLogin('/games?' + new URLSearchParams({ q })));
      const localOnly = !domesticCatalog && (trafficProtection.busy || wantsLocal || (!user && Boolean(q)));
      const page = clampInt(url.searchParams.get('page') || '1', 1, 500) || 1;

      const catalogue=collectedCatalogue.view(q,url.searchParams,{domesticOnly});
      // Personal state stays outside the shared catalogue snapshot. Filter once
      // before pagination, using only the authenticated member's valid records.
      const marked = user && localOnly ? new Set(db.checkins.filter(c => c.userId === user.id && ['wish','doing','done','dropped'].includes(c.status)).map(c => c.gameId)) : null;
      const unmarked = marked ? catalogue.games.filter(game => !marked.has(game.id)) : [];
      const creatorFilters=catalogue.filters,allLocalHits=unmarkedOnly?unmarked:catalogue.games;
      const selectedLocal=localOnly?allLocalHits.slice((page-1)*24,page*24):q?allLocalHits.slice(0,24):[];
      const localHits=selectedLocal.map(game=>decorate(db,game));
      let result = { result: [], total: 0, hasNext: false, pageNum: page, pageSize: 12 };
      let remoteError = '';

      if (domesticCatalog) {
        const games = domesticWorks.list(q);
        const selected = games.slice((page - 1) * 24, page * 24).map(g => rememberWork(g.id ? decorate(db, g) : { ...g, stats: { avg: 0, count: 0 } }));
        result = { result: selected, total: games.length, hasNext: page * 24 < games.length, pageNum: page, pageSize: 24 };
      } else if (!localOnly && !user) {
        const games = ymgal.cachedRandom(10).map(item => rememberWork(db.gameByGid(item.gid) ? decorate(db, db.gameByGid(item.gid)) : { ...item, stats: { avg: 0, count: 0 } }));
        result = { ...result, result: games, total: games.length };
      } else if (!localOnly) {
        remoteBudget(req, user, q ? 'full-search' : 'discovery', q ? 12 : 6);
        try {
          if (q) {
            // 只把「本地已有的作品」补上统计信息；搜索命中的陌生作品不落库，避免本地库被随手搜索撑爆
            const found = await workCatalogue.search(q,page);
            const decorated = found.result.map((item) => {
              const local = db.gameByGid(item.gid);
              return rememberWork(local ? decorate(db, local) : { ...item, stats: { avg: 0, count: 0 } });
            });
            result = { ...found, result: decorated };
            if(found.partial?.length)remoteError=found.partial.join('、')+' 暂时不可用，已保留其他来源和缓存中的结果。';
            else if(found.updating)remoteError='已显示本地资料，其他来源仍在补充，稍后重新搜索可查看完整结果。';
          } else {
            const random = await ymgal.randomGames(10, { fresh: url.searchParams.get('shuffle') === '1' });
            const decorated = random.map((item) => {
              const local = db.gameByGid(item.gid);
              return rememberWork(local ? decorate(db, local) : { ...item, stats: { avg: 0, count: 0 } });
            });
            result = { result: decorated, total: decorated.length, hasNext: false, pageNum: 1, pageSize: 12 };
          }
        } catch (err) {
          remoteError = q?'部分资料源暂时不可用，请稍后重试。':err instanceof YmgalError ? err.message : String(err?.message || err);
        }
      }

      const body = views.pageGames({
        query: q,
        page: result.pageNum || page,
        result,
        localHits,
        localTotal: allLocalHits.length,
        isLocalOnly: localOnly,
        isGuest: !user,
        creatorFilters,
        domesticCatalog,
        domesticOnly,
        unmarkedOnly,
        unmarkedTotal: user ? unmarked.length : null,
      });
      const html = remoteError
        ? views.layout({
            config,
            user,
            title: '作品',
            battleVisible: battle.canView(user),
            active: 'games',
            bodyClass: 'catalog-page',
            body: `${views.flashBlock({ message: remoteError, kind: 'error' })}${body}`,
          })
        : views.layout({ config, user, battleVisible: battle.canView(user), title: '作品', active: 'games', body, bodyClass: 'catalog-page' });
      return sendHtml(res, 200, html, {}, req);
    }

    const walkthroughMatch=pathname.match(/^\/game\/((?:cn|vn|bg)?[1-9]\d{0,8})\/walkthrough$/);
    if(walkthroughMatch){
      const gid=walkthroughMatch[1],game=db.gameByGid(gid)||{gid};
      if(!hasWorkWalkthrough(game))return render(404,'攻略尚未收录',views.pageError({status:404,message:'这部作品暂未收录路线攻略。'}),'games');
      if(String(game.gid)!==gid)return redirect(res,'/game/'+game.gid+'/walkthrough');
      const meta=workWalkthroughMeta(game);
      return render(200,meta.title,workWalkthroughPage(game,user),'games',{bodyClass:meta.bodyClass});
    }
    const gameMatch = pathname.match(/^\/game\/((?:cn|vn|bg)?[1-9]\d{0,8})$/);
    if (gameMatch) {
      const gid = gameMatch[1];
      let game = db.gameByGid(gid);
      if(!game&&gid.startsWith('bg'))game=await workCatalogue.loadBangumi(gid,{persist:Boolean(user)});
      if(!game&&user&&gid.startsWith('vn')&&!trafficProtection.busy){remoteBudget(req,user,'new-detail');game=await workCatalogue.loadVn(gid,{persist:true});}
      const bundled = await domesticWorks.load(gid, { persist: Boolean(user) });
      game = game || bundled;
      if (game && String(game.gid) !== gid) return redirect(res, '/game/' + game.gid);
      if (game) game = domesticIndex.enrich(game);
      let loadError = '';
      if (!game && !user) return redirect(res, catalogLogin(url.pathname));
      if(!game&&trafficProtection.busy)requireRemote();
      if (!game && user && /^\d+$/.test(gid) && !trafficProtection.busy) {
        remoteBudget(req, user, 'new-detail');
        try {
          game = await ymgal.getGame(gid, { force: !game });
        } catch (err) {
          loadError = err instanceof YmgalError ? err.message : String(err?.message || err);
          const known=searchWorks.get(gid);if(known?.vndbId){const fallback=await vnCatalogue.get(known.vndbId).catch(()=>null);if(fallback)game=await workCatalogue.save({...fallback,gid});}
        }
      }
      if (!game) game = db.gameByGid(gid);
      if (!game) {
        return render(404, '找不到作品', views.pageError({ status: 404, message: `月幕没有 gid=${gid} 的档案，或接口暂时不可用。${loadError}` }), 'games');
      }
      game=withWorkMedia(game);
      const body = workBody(game,user,url);
      let prefix = loadError
        ? views.flashBlock({ message: `月幕同步失败，正在展示本地缓存：${loadError}`, kind: 'error' })
        : '';
      if (!user && (!game.introduction || !game.media)) prefix += `<p class="cl-guest-notice">你正在浏览已有的作品资料。<a href="${esc(catalogLogin(url.pathname))}">登录后补全资料与画面预览 ↗</a></p>`;
      const supplement=user&&!trafficProtection.busy&&!game.identityPending&&((!game.introduction&&/^\d+$/.test(gid))||gid.startsWith('bg')&&Boolean(bangumiCatalogue.token)&&!bangumiCatalogue.cover(game)||mediaClient.needsResolve(game)&&!game.domestic||game.developerId&&(!game.orgName||localRelated(game).length<3)&&!dataDirOverride);
      const content=supplement?'<div data-work-enrichment="'+esc(gid)+'"><p class="wd-enrichment-note" data-work-enrichment-note role="status">已展示本站已有资料。</p>'+prefix+body+'</div>':prefix+body;
      return render(200, game.chineseName || game.name, content, 'games', { bodyClass: 'work-detail-page' });
    }

    if (pathname === '/rank') {
      const scope = url.searchParams.get('scope') === 'month' ? 'month' : 'all';
      const ranking = rankingData(db, scope);
      const ranked = ranking.rows;
      const pageSize = 12;
      const pages = Math.max(1, Math.ceil(ranked.length / pageSize));
      const page = Math.min(pages, clampInt(url.searchParams.get('page') || '1', 1, 500) || 1);
      const rows = hydrate(ranked.slice((page - 1) * pageSize, page * pageSize));
      return render(200, '排行', views.pageRank({ rows, scope, page, pageSize, total: ranked.length, referenceAverage: ranking.referenceAverage, referenceWeight: ranking.referenceWeight }), 'rank', { bodyClass: 'ranking-page' });
    }

    if (pathname === '/collection') {
      const rows = recordsFor(db);
      const records = recordPage(rows, url.searchParams, 20);
      const members = db.users.all().map(u => ({ user: u, stats: db.userStats(u.id), total: rows.filter(r => r.user.id === u.id).length })).filter(m => m.total).sort((a, b) => b.total - a.total).slice(0, 8);
      return render(200, '打卡墙', views.pageCollection({ records, members }), 'collection', { bodyClass: 'community-wall-page' });
    }

    if (['/login', '/register', '/forgot-password'].includes(pathname)) {
      const next = catalogReturn(url.searchParams.get('next'));
      if (pathname === '/login' && user && next) return redirect(res, next);
      if (pathname === '/register' && user) return redirect(res, '/me');
      const mode = pathname === '/login' ? 'login' : pathname === '/register' ? 'register' : 'reset';
      return render(
        200,
        mode === 'login' ? '登录' : mode === 'reset' ? '找回密码' : '注册',
        views.pageAuth({
          mode,
          flash: flashFromUrl(url),
          defaultInvite: str(url.searchParams.get('code'), 20),
          siteOpen: Boolean(config.security?.allowRegistration),
          next,
        }),
        '', { bodyClass: 'member-auth-page' },
      );
    }

    if (pathname === '/admin/annual-analysis') {
      if (!user) return redirect(res, '/login');
      if (!isSuperAdmin(user)) throw new HttpError(403, '只有超级管理员可以设置年度分析');
      return render(200, '年度分析工作台', views.flashBlock(flashFromUrl(url)) + annualAdmin({ settings: annualAnalysis.settings(), user }), '', { bodyClass: 'annual-admin-page' });
    }
    if (pathname === '/api/me/annual-analysis') {
      if (!user) throw new HttpError(401, '请先登录');
      if (!annualAnalysis.canView(user)) throw new HttpError(404, '年度分析尚未开放');
      return sendJson(res, 200, annualAnalysis.report(user), req);
    }
    if (pathname === '/me/annual-analysis') {
      if (!user) return redirect(res, '/login');
      if (!annualAnalysis.canView(user)) throw new HttpError(404, '年度分析尚未开放');
      return render(200, '我的年度故事册', annualAnalysisPage(annualAnalysis.report(user)), '', { bodyClass: 'annual-analysis-page' });
    }
    if(pathname==='/me/story-card'){
      if(!user)return redirect(res,'/login?next='+encodeURIComponent('/me/story-card'));
      return render(200,'我的资历卡',storyCardPage(storyCardData(db,user,storyWork)),'',{bodyClass:'story-card-page'});
    }
    if (pathname === '/me') {
      if (!user) return redirect(res, '/login');
      if(steam.enabled&&steamProfile.configured&&steam.account(user.id)&&!trafficProtection.busy){
        try{steamProfile.refresh(user).catch(()=>{});}catch{}
      }
      const records = recordPage(recordsFor(db, user.id), url.searchParams);
      const tasteView = tasteDiscovery.view(user.id);
      const tasteEntry = tasteDiscoveryPanel({ view: tasteView, members: new Map(tasteView.matches.map(match => { const member = db.users.get(match.userId); return [match.userId, {...member, progress:memberLevels.view(match.userId)}]; })), games: tasteDiscovery.games, open:url.searchParams.get('discovery')==='1' });
      const body = views.pageMe({ user, stats: db.userStats(user.id), records, annualSettings: annualAnalysis.settings(), pilgrimageEntry: pilgrimageEntry(pilgrimage,user), birthdayEntry: birthdayProfile(characterBirthdays,user), steamEntry:steamCard(steam,user,true), importEntry:bangumiImport.enabled?importEntry():'', tasteEntry,listsEntry:listProfileEntry(workLists,user,{owner:true}) });
      const flash = flashFromUrl(url);
      return render(200, '我的', (flash ? views.flashBlock(flash) : '') + body, '', { bodyClass: 'member-profile-page' });
    }
    const tasteMatch = pathname.match(/^\/me\/similar\/([1-9]\d{0,14})$/);
    if (tasteMatch) {
      if (!user) return redirect(res, '/login');
      if (!limiter.allow(user.id+'|taste-compare',30)) throw new HttpError(429,'请稍后再比较作品');
      const member = db.userByUid(tasteMatch[1]);
      const match = member && tasteDiscovery.detail(user.id,member.id);
      if (!match) throw new HttpError(404,'这位群友暂不参与推荐，或还没有足够的共同记录。');
      if (url.searchParams.get('fragment')==='1') return sendHtml(res,200,tasteComparisonPage({member,match,games:tasteDiscovery.games,embedded:true}),{},req);
      return render(200,'共同的故事',tasteComparisonPage({member,match,games:tasteDiscovery.games}),'',{bodyClass:'member-profile-page'});
    }
    const publicCollectionMatch=pathname.match(/^\/u\/([^/]+)\/(characters|pilgrimage)$/);
    if(publicCollectionMatch){
      const member=db.userByName(decodeURIComponent(publicCollectionMatch[1]));
      if(!member)throw new HttpError(404,'没有找到这位群友。');
      if(publicCollectionMatch[2]==='pilgrimage'){
        if(!pilgrimage.enabled)throw new HttpError(404,'巡礼尚未开放');
        return render(200,displayName(member)+'的巡礼足迹',pilgrimagePublicCollection(pilgrimage,member,url.searchParams),'pilgrimage');
      }
      return render(200,displayName(member)+'的角色收藏',birthdayPublicCollection(characterBirthdays,member,url.searchParams),'');
    }
    const profileMatch = pathname.match(/^\/u\/([^/]+)$/);
    const uidProfileMatch = pathname.match(/^\/me\/([1-9]\d{0,14})$/);
    if (profileMatch || uidProfileMatch) {
      const storedUser = uidProfileMatch ? db.userByUid(uidProfileMatch[1]) : db.userByName(decodeURIComponent(profileMatch[1]));
      const profileUser = storedUser ? {...storedUser,progress:memberLevels.view(storedUser.id)} : null;
      if (!profileUser) return render(404, '找不到用户', views.pageError({ status: 404, message: '没有找到这位群友。' }), '');
      const records = recordPage(recordsFor(db, profileUser.id), url.searchParams);
      return render(200, displayName(profileUser), views.pageProfile({ profileUser, profilePath:uidProfileMatch?'/me/'+profileUser.uid:'', stats: db.userStats(profileUser.id), records, pilgrimageEntry:pilgrimageEntry(pilgrimage,profileUser,{owner:false}), birthdayEntry:birthdayProfile(characterBirthdays,profileUser,{owner:false}),steamEntry:steamCard(steam,profileUser,false),listsEntry:listProfileEntry(workLists,profileUser) }), '', { bodyClass: 'member-profile-page' });
    }

    if (pathname === '/admin') {
      if (!user) return redirect(res, '/login');
      if (!user.isAdmin) {
        return render(403, '无权访问', views.pageError({ status: 403, message: '只有站长可以进后台。' }), '');
      }
      const body = views.pageAdmin({
        invites: db.invites.all(),
        canMarkSource: isSuperAdmin(user),
        stats: db.siteStats(),
        importLog: str(url.searchParams.get('log'), 4000),
        mailReady: mailer.ready,
      });
      const flash = flashFromUrl(url);
      return render(200, '站长后台', (flash ? views.flashBlock(flash) : '') + (isSuperAdmin(user) ? '<div class="panel"><h2>超级管理员</h2><a class="btn btn-primary" href="/admin/site">内容与素材工作台 →</a> <a class="btn" href="/admin/users">当前成员列表 →</a> <a class="btn" href="/admin/runtime">运行状态 →</a> <a class="btn" href="/admin/traffic">访问保护 →</a></div>' : '') + '<div class="panel"><h2>作品资料</h2><a class="btn" href="/admin/corrections">资料纠错收件箱 →</a></div>' + battleVisibilityControl({ data: battle.view(user.id), user, redirect: '/admin' }) + annualAdmin({ settings: annualAnalysis.settings(), user, compact: true }) + body, '');
    }

    return render(404, '页面不存在', views.pageError({ status: 404, message: '这个地址没有内容。' }), '');
  }

  /* --------------------------- 表单处理 --------------------------- */

  async function handlePost(req, res, url, ctx, form) {
    const { user } = ctx;
    const pathname = url.pathname;
    if(pathname==='/api/lists/like'){
      if(!user)throw new HttpError(401,'请先登录后点赞');if(!limiter.allow(user.id+'|list-like',90))throw new HttpError(429,'点赞操作较多，请稍后重试');const state=await workLists.like(user,String(form.id||''),form.value);if(String(req.headers.accept||'').includes('application/json'))return sendJson(res,200,state,req);let destination='/lists/'+state.id;try{const u=new URL(String(form.returnTo||destination),'http://return.local');if(u.origin==='http://return.local'&&/^\/(?:lists|me\/lists)(?:\/[a-f0-9]{24})?$/.test(u.pathname))destination=u.pathname+u.search;}catch{}return redirect(res,destination);
    }
    if(pathname==='/api/lists/collaborate'){
      if(!user)throw new HttpError(401,'请先登录');if(!limiter.allow(user.id+'|list-collaboration',30))throw new HttpError(429,'操作较多，请稍后重试');
      const row=await workLists.collaborate(user,String(form.id||''),form),requestId=form.requestId||(form.action==='request'?row.requests?.findLast(r=>r.userId===user.id)?.id:null),location=requestId?'/lists/requests/'+requestId:['leave','decline'].includes(form.action)?'/me/lists':form.action==='accept'?'/lists/'+row.id:'/lists/'+row.id+'/edit#wl-collaborators';
      if(String(req.headers.accept||'').includes('application/json'))return sendJson(res,200,{id:row.id,revision:row.revision,location},req);
      return redirect(res,withFlash(location,form.action==='invite'?'协作邀请已发送至站内消息':'协作设置已更新','ok'));
    }
    if(pathname==='/api/lists/create'||pathname==='/api/lists/change'){
      if(!user)throw new HttpError(401,'请先登录，再管理作品清单');
      if(!limiter.allow(user.id+'|work-lists-write',40))throw new HttpError(429,'保存过于频繁，请稍后重试');
      const creating=pathname.endsWith('/create'),row=creating?await workLists.create(user,form):await workLists.change(user,String(form.id||''),form);
      let location=creating?'/lists/'+row.id+'/edit#wl-search':['delete','restore'].includes(form.action)?'/me/lists':'/lists/'+row.id+'/edit';
      if(!creating&&form.action==='add'&&form.returnGid===form.gid)location='/me/lists/add?gid='+encodeURIComponent(workLists.work(form.gid).gid);
      else if(!creating&&typeof form.returnTo==='string'&&form.returnTo.length<=600&&!/[\\\u0000-\u001f]/.test(form.returnTo)){
        const requested=new URL(form.returnTo,'http://list.local');if(requested.origin==='http://list.local'&&requested.pathname==='/lists/'+row.id+'/edit'&&!['delete','restore'].includes(form.action))location=requested.pathname+requested.search+requested.hash;
      }
      if(String(req.headers.accept||'').includes('application/json')){
        const payload={location,id:row.id,revision:row.revision};
        if(!creating&&['add','remove'].includes(form.action)){
          payload.membership=listMembership(workLists,row);
          const target=new URL(location,'http://list.local');
          if(target.pathname==='/lists/'+row.id+'/edit'){payload.entriesHtml=listEditEntries(workLists,row,target.searchParams);payload.coverOptionsHtml=listCoverOptions(workLists,row);}
        }
        return sendJson(res,creating?201:200,payload,req);
      }
      return redirect(res,withFlash(location,'清单已保存','ok'));
    }
    if(pathname.startsWith('/api/corrections/')){
      if(!user)throw new HttpError(401,'请先登录');
      const operation=pathname.slice('/api/corrections/'.length);
      if(!['submit','member','review','revoke'].includes(operation))throw new HttpError(404,'操作不存在');
      if(['review','revoke'].includes(operation)&&!workCorrections.canReview(user))throw new HttpError(403,'只有管理员可以处理纠错');
      if(!limiter.allow(user.id+'|corrections-'+(operation==='submit'?'submit':'manage'),operation==='submit'?6:30))throw new HttpError(429,'操作过于频繁，请稍后再试');
      if(operation==='submit'){const rows=await workCorrections.submit(user,form);return redirect(res,withFlash('/me/corrections/'+rows[0].id,`已提交 ${rows.length} 项纠错，可在这里查看进度。`,'ok'));}
      if(operation==='member'){const r=await workCorrections.memberChange(user,str(form.id,24),form);return redirect(res,withFlash('/me/corrections/'+r.id,'纠错记录已更新。','ok'));}
      if(operation==='review'){const r=await workCorrections.review(user,str(form.id,24),form);return redirect(res,withFlash('/admin/corrections/'+r.id,'处理结果已保存，提交者可在站内消息查看。','ok'));}
      await workCorrections.revoke(user,str(form.gid,12),str(form.field,30),form);return redirect(res,withFlash('/admin/corrections?status=accepted','本地修正已撤销，恢复使用最新源站资料。','ok'));
    }

    const back = (message, kind = 'ok', fallback = '/') => {
      const destination = str(form.redirect, 700);
      const safe = destination.startsWith('/') && !destination.startsWith('//') && !destination.includes('\\') ? destination : fallback;
      redirect(res, withFlash(safe, message, kind));
    };

    if(pathname==='/admin/traffic'){
      if(!user)throw new HttpError(401,'请先登录');
      if(!isSuperAdmin(user))throw new HttpError(403,'只有超级管理员可以管理访问保护');
      if(!limiter.allow(user.id+'|traffic-protection',6))throw new HttpError(429,'切换过于频繁，请稍后再试');
      const state=await trafficProtection.set(form.mode,form.revision,user.id);
      return redirect(res,withFlash('/admin/traffic',state.policy==='auto'?'自动保护已启用，将根据持续压力开启并在稳定后恢复。':state.mode==='busy'?'已手动开启繁忙保护，记录功能继续开放。':'已手动保持正常模式，自动切换已暂停。','ok'));
    }

    /* ---------- 账号 ---------- */
    if (['/api/music/share', '/api/music/remove', '/api/music/like','/api/music/reply','/api/music/reply/remove','/api/music/endorse'].includes(pathname)) {
      if (!user) throw new HttpError(401, '请先登录再分享音乐');
      if (!limiter.allow(user.id + '|music-community-write', 20)) throw new HttpError(429, '操作过于频繁，请稍后再试');
      const wantsJson = String(req.headers.accept || '').includes('application/json');
      if (pathname === '/api/music/endorse') {
        const result=await musicSharing.endorse(user,form.songId,form.recommended);
        return wantsJson?sendJson(res,200,{songId:form.songId,...result,members:new Set(musicSharing.state.endorsements.filter(v=>v.active).map(v=>v.userId)).size,popular:musicSharing.ranking(user)},req):redirect(res,'/music/song/'+encodeURIComponent(form.songId));
      }
      if (pathname === '/api/music/reply' || pathname === '/api/music/reply/remove') {
        if (!limiter.allow(user.id+'|music-reply',10)) throw new HttpError(429,'回复操作过于频繁，请稍后重试');
        const reply=pathname.endsWith('/remove')?await musicSharing.deleteReply(user,form.replyId):await musicSharing.reply(user,form);
        const destination=musicSharing.destination({postId:reply.postId,replyId:reply.id});
        return wantsJson?sendJson(res,200,{url:destination},req):redirect(res,destination);
      }
      if (pathname === '/api/music/like') {
        await musicSharing.like(user, form.postId, form.liked);
        const likes = musicSharing.state.likes.filter(item => item.postId === form.postId);
        if (wantsJson) return sendJson(res, 200, { liked: likes.some(item => item.userId === user.id), count: likes.length }, req);
        return redirect(res, '/music/post/' + encodeURIComponent(form.postId));
      }
      if (pathname === '/api/music/remove') {
        await musicSharing.remove(user, form.postId);
        return wantsJson ? sendJson(res, 200, { url: '/music' }, req) : redirect(res, '/music');
      }
      const work = musicWork(form.gid);
      let id;
      if (form.postId) id = await musicSharing.edit(user, form.postId, work, form);
      else {
        const song = form.selection ? musicSource.selected(form.selection, user.id, ctx.sessionId) : musicSharing.song(form.songId);
        if (!song) throw new HttpError(400, '请从搜索结果或音乐库中选择歌曲');
        id = await musicSharing.publish(user, song, work, form);
      }
      const destination = '/music/post/' + id;
      return wantsJson ? sendJson(res, 200, { url: destination, id }, req) : redirect(res, destination);
    }
    if (pathname === '/api/music/selection') {
      if (!user) throw new HttpError(401, '请先登录');
      if (!isSuperAdmin(user)) throw new HttpError(403, '只有超级管理员可以维护精选音乐');
      if (!limiter.allow(user.id + '|music-write', 20)) throw new HttpError(429, '操作过于频繁，请稍后再试');
      try {
        await musicPlayer.edit(user, form);
      } catch (error) {
        if (!error.status || error.status >= 500) throw error;
        return redirect(res, withFlash('/music/selected', error.message, 'error'));
      }
      return redirect(res, withFlash('/music/selected', '精选列表已更新', 'ok'));
    }
    if (pathname === '/api/me/taste-discovery') {
      if (!user) throw new HttpError(401,'请先登录');
      if (!limiter.allow(user.id+'|taste-settings',10)) throw new HttpError(429,'请稍后再修改推荐设置');
      if (!['0','1'].includes(form.enabled)) throw new HttpError(400,'请选择开启或关闭同好推荐');
      await tasteDiscovery.setEnabled(user.id,form.enabled==='1');
      return redirect(res,withFlash('/me?discovery=1#like-minded',form.enabled==='1'?'同好推荐已开启。':'已退出同好推荐。','ok'));
    }
    if(pathname==='/admin/integrations/steam'){
      if(!isSuperAdmin(user))throw new HttpError(403,'只有超级管理员可以配置 Steam 资料接口');
      if(!limiter.allow(user.id+'|steam-key',5))throw new HttpError(429,'请稍后再保存配置');
      try{await steamProfile.configure(form.apiKey);}
      catch(error){return integrationFailure(req,res,error,'/admin/integrations/steam');}
      if(steam.enabled&&steam.account(user.id)&&steamProfile.configured&&!trafficProtection.busy)Promise.resolve().then(()=>steamProfile.refresh(user)).catch(()=>{});
      return redirect(res,withFlash('/me',steamProfile.configured?'Steam 资料接口已配置，正在读取公开资料。':'Steam 资料接口已停用。','ok'));
    }
    if(pathname==='/api/steam/refresh'){
      if(!user)throw new HttpError(401,'请先登录');
      requireRemote();
      try{await steamProfile.refresh(user,{force:true});return back('Steam 公开资料已更新','ok','/me');}
      catch(error){return integrationFailure(req,res,error,'/me');}
    }
    if(pathname==='/api/steam/connect'){
      if(!user)throw new HttpError(401,'请先登录');
      if(!limiter.allow(user.id+'|steam-connect',3))throw new HttpError(429,'请稍后再开始绑定');
      try{
        const authorization=new URL(steam.start(user,ctx.sessionId));
        const state=new URL(authorization.searchParams.get('openid.return_to')).searchParams.get('state');
        return redirect(res,'/me/steam?state='+state);
      }catch(error){return integrationFailure(req,res,error,'/me');}
    }
    if(pathname==='/api/steam/unlink'){await steam.unlink(user);return back('Steam 绑定已解除','ok','/me');}
    if(pathname==='/api/import/bangumi/preview'){
      if(!user)throw new HttpError(401,'请先登录');
      requireRemote();
      if(!limiter.allow(user.id+'|bangumi-preview',4))throw new HttpError(429,'请稍后再读取记录');
      let stage;try{stage=await bangumiImport.prepare(user,ctx.sessionId,form);}
      catch(error){return integrationFailure(req,res,error,'/me/import/bangumi?username='+encodeURIComponent(str(form.username,180)));}
      return redirect(res,'/me/import/bangumi?preview='+stage.token);
    }
    if(pathname==='/api/import/bangumi/apply'){
      if(!user)throw new HttpError(401,'请先登录');
      if(!limiter.allow(user.id+'|bangumi-apply',6))throw new HttpError(429,'请稍后再导入');
      const run=recordWrites.then(()=>bangumiImport.apply(user,ctx.sessionId,form));recordWrites=run.catch(()=>{});
      try{await run;}catch(error){return integrationFailure(req,res,error,'/me/import/bangumi?preview='+encodeURIComponent(str(form.token,100)));}
      return redirect(res,'/me/import/bangumi?result='+form.token);
    }
    if(pathname==='/api/characters/follow'){
      if(!user)throw new HttpError(401,'请先登录，再收藏角色');
      if(!limiter.allow(`${user.id}|character-follow`,60))throw new HttpError(429,'请稍后再收藏角色');
      const result=await characterBirthdays.save(user,form);
      if(String(req.headers.accept||'').includes('application/json'))return sendJson(res,200,result,req);
      return back(result.selected?'角色已收进收藏。':'已取消角色收藏。','ok','/birthdays');
    }
    if(pathname==='/api/pilgrimage/mark'){
      if(!pilgrimage.enabled)throw new HttpError(404,'巡礼手账尚未开放');
      if(!user)throw new HttpError(401,'请先登录，再留下足迹');
      if(!limiter.allow(`${user.id}|pilgrimage-mark`,30))throw new HttpError(429,'请稍后再保存手账');
      const result=await pilgrimage.save(user,form);
      if(String(req.headers.accept||'').includes('application/json'))return sendJson(res,200,result,req);
      return redirect(res,withFlash('/me/pilgrimage','足迹已收进手账。','ok'));
    }
    if(['/api/review/like','/api/review/reply','/api/review/reply/delete','/api/notifications/open','/api/notifications/read-all'].includes(pathname)){
      if(!user){if(String(req.headers.accept||'').includes('application/json'))throw new HttpError(401,'请先登录');return redirect(res,'/login');}
      if(pathname==='/api/review/like'){
        if(!limiter.allow(user.id+'|review-like',60))throw new HttpError(429,'点赞过于频繁，请稍后再试');
        const review=reviewCommunity.review(str(form.reviewId,80));await reviewCommunity.like(user,review.id,String(form.liked));
        const view=reviewCommunity.view(review.id,user.id);
        if(String(req.headers.accept||'').includes('application/json'))return sendJson(res,200,{liked:view.liked,likeCount:view.likeCount},req);
        return redirect(res,'/reviews/'+encodeURIComponent(review.id)+'#review-'+review.id);
      }
      if(pathname==='/api/review/reply'){
        if(!limiter.allow(user.id+'|review-reply',10))throw new HttpError(429,'回复过于频繁，请稍后再试');
        let reply;
        try{reply=await reviewCommunity.reply(user,form);}catch(error){if(error.status&&String(req.headers.accept||'').includes('text/html'))return redirect(res,withFlash('/reviews/'+encodeURIComponent(str(form.reviewId,80)),error.message,'error'));throw error;}
        return redirect(res,'/reviews/'+encodeURIComponent(reply.reviewId)+'#reply-'+reply.id);
      }
      if(pathname==='/api/review/reply/delete'){
        const reply=await reviewCommunity.deleteReply(user,str(form.replyId,80));return redirect(res,'/reviews/'+encodeURIComponent(reply.reviewId)+'#reply-'+reply.id);
      }
      if(!limiter.allow(user.id+'|notifications-write',60))throw new HttpError(429,'操作过于频繁，请稍后再试');
      if(pathname==='/api/notifications/open')return redirect(res,await reviewCommunity.read(user.id,str(form.id,100)));
      await reviewCommunity.readAll(user.id,String(form.before||''));return redirect(res,'/messages');
    }
    if (pathname === '/api/email/send') {
      try {
        if (form.purpose === 'register' && !config.security?.allowRegistration) throw new AuthError('本站当前关闭了注册', 403);
        await emailVerification.send({ email: form.email, purpose: form.purpose, user, ip: req.clientIp });
        return sendJson(res, 200, { message: form.purpose === 'reset' ? '如果该邮箱已绑定账号，验证码将发送到你的邮箱。' : '验证码已发送，请查看邮箱（也请检查垃圾邮件）。' }, req);
      } catch (err) {
        return sendJson(res, err instanceof AuthError ? err.status : 503, { message: err instanceof AuthError ? err.message : '验证码发送失败，请稍后重试' }, req);
      }
    }
    if (pathname === '/forgot-password') {
      try {
        await auth.resetPassword(form);
        return redirect(res, withFlash('/login', '密码已重置，请使用新密码登录。', 'ok'), auth.clearCookie());
      } catch (err) {
        return redirect(res, withFlash('/forgot-password', err instanceof AuthError ? err.message : '重置失败，请稍后重试', 'error'));
      }
    }
    if (pathname === '/register') {
      try {
        const { session } = await auth.register({
          username: form.username,
          password: form.password,
          password2: form.password2,
          inviteCode: form.inviteCode,
          email: form.email,
          emailCode: form.emailCode,
          policyVersion: form.policyVersion,
        });
        return redirect(res, '/', auth.sessionCookie(session, req.secureCookies));
      } catch (err) {
        const msg = err instanceof AuthError ? err.message : '注册失败，请稍后再试';
        return redirect(res, withFlash('/register', msg, 'error'));
      }
    }

    if (pathname === '/login') {
      const next = catalogReturn(form.next);
      const retry = next ? catalogLogin(next) : '/login';
      const lockedMinutes = authLocked(req, form.username);
      if (lockedMinutes) {
        return redirect(res, withFlash(retry, `登录失败次数过多，请 ${lockedMinutes} 分钟后再试`, 'error'));
      }
      try {
        const { session } = await auth.login({ username: form.username, password: form.password });
        authFailures.delete(failureKey(req, form.username));
        return redirect(res, next || '/', auth.sessionCookie(session, req.secureCookies));
      } catch (err) {
        noteAuthFailure(req, form.username);
        const msg = err instanceof AuthError ? err.message : '登录失败，请稍后再试';
        return redirect(res, withFlash(retry, msg, 'error'));
      }
    }

    if (pathname === '/logout') {
      await auth.logout(ctx.sessionId);
      return redirect(res, '/', auth.clearCookie());
    }

    /* ---------- 需要登录的操作 ---------- */
    const needLogin = () => redirect(res, withFlash('/login', '请先登录', 'error'));

    if (pathname.startsWith('/api/') || pathname.startsWith('/admin/')) {
      if(!user&&pathname==='/api/record'&&String(req.headers.accept||'').includes('application/json'))throw new HttpError(401,'登录已失效，请重新登录后保存');
      if (!user) return needLogin();
    }

    if (pathname === '/admin/annual-analysis/settings') {
      if (!isSuperAdmin(user)) throw new HttpError(403, '只有超级管理员可以设置年度分析');
      try { await annualAnalysis.configure(user, form); return back(form.enabled === '1' ? '年度分析已开放，入口已加入个人中心' : '年度分析已隐藏', 'ok', '/admin/annual-analysis'); }
      catch (err) { return back(err.message, 'error', '/admin/annual-analysis'); }
    }
    if (pathname === '/admin/site/content') {
      if (!isSuperAdmin(user)) throw new HttpError(403, '只有超级管理员可以编辑内容');
      try { await content.save(user, form); return back('内容已保存', 'ok', '/admin/site'); }
      catch (err) { return back(err.message, 'error', '/admin/site'); }
    }
    if (pathname === '/admin/cover') {
      if (!isSuperAdmin(user)) throw new HttpError(403, '只有超级管理员可以调整封面遮挡');
      const gid = workKey(form.gid);
      const game = db.gameByGid(gid) || searchWorks.get(gid);
      if (!game) throw new HttpError(404, '未找到作品');
      try {
        const before = await setCoverPolicy(game, form.mode);
        await db.audit.insert({ userId: user.id, action: 'cover.policy', key: gid, before, after: form.mode });
        return back('封面展示已更新', 'ok', '/game/' + gid);
      } catch (err) { return back(err.message, 'error', '/game/' + gid); }
    }

    const gameOf = (gidValue) => {
      const gid = workKey(gidValue);
      if (!gid) return null;
      return db.gameByGid(gid);
    };

    if (pathname === '/admin/game/domestic') {
      if (!user.isAdmin && !isSuperAdmin(user)) throw new HttpError(403, '只有管理员可以标注国产作品');
      const game = gameOf(form.gid);
      if (!game) throw new HttpError(404, '作品不存在');
      if (!['auto', 'yes', 'no'].includes(form.mode)) throw new HttpError(400, '请选择标注方式');
      const before = game.domesticOverride ?? null;
      const after = form.mode === 'auto' ? null : form.mode === 'yes';
      await db.games.update(game.id, { domesticOverride: after });
      await db.audit.insert({ userId: user.id, action: 'game.domestic', key: String(game.gid), before, after });
      return back('国产作品标注已更新', 'ok', '/game/' + game.gid);
    }

    if (pathname === '/api/avatar') {
      if (!validAvatar(form.avatarId)) return back('请选择列表中的头像', 'error', '/me');
      await db.users.update(user.id, { avatarId: form.avatarId });
      return back('头像已保存', 'ok', '/me');
    }
    if(pathname==='/api/preferences/covers'){
      form.value=form.value??'off';if(!['on','off'].includes(form.value))throw new HttpError(400,'请选择封面显示方式');
      await db.users.update(user.id,{showOriginalCovers:form.value==='on'});
      const next=String(form.redirect||'/me');let destination='/me';try{const u=new URL(next,'http://return.local');if(u.origin==='http://return.local'&&u.pathname.startsWith('/')&&!u.pathname.startsWith('/api/'))destination=u.pathname+u.search;}catch{}
      return redirect(res,withFlash(destination,'封面显示偏好已保存','ok'));
    }

    if (pathname === '/api/profile') {
      try {
        await db.users.update(user.id, profilePatch(form));
        return back('资料已保存', 'ok', '/me');
      } catch (err) { return back(err.message, 'error', '/me'); }
    }
    if (pathname === '/api/member/sign-in') {
      if (!user) return needLogin();
      const result = await memberLevels.sync(user.id,true);
      return back(result.signed ? '今日签到成功，获得 10 EXP。' : '今天已经签到过了，明天再见。','ok','/me');
    }
    if (pathname === '/api/collection/status') {
      if (!user) throw new HttpError(401, '请登录后再点亮格子');
      const game = gameOf(form.gid);
      if (!game) throw new HttpError(404, '作品不存在');
      const next = { '': 'wish', wish: 'doing', doing: 'done', dropped: 'doing' };
      const expected = String(form.expected || '');
      if (!Object.hasOwn(next, expected) || next[expected] !== form.status) throw new HttpError(400, '请选择格子上可用的下一步');
      const run = recordWrites.then(async () => {
        const current = db.checkinsForUser(user.id, game.id)[0]?.status || '';
        if (current !== expected) throw new HttpError(409, '这格已在别处更新，请刷新后再试');
        await saveRecord(db, user.id, game.id, { status: form.status });
        await memberLevels.sync(user.id);
        return recordPage(recordsFor(db,user.id),new URLSearchParams({filter:String(form.filter||'all'),sort:String(form.sort||'recent'),page:String(form.page||'1')}));
      });
      recordWrites = run.catch(() => {});
      const records = await run;
      if (!String(req.headers.accept || '').includes('application/json')) return back('新的故事印章已留下', 'ok', '/me#records');
      return sendJson(res,200,{ levelHtml:levelPanel(memberLevels.view(user.id)),annualBadgeHtml:annualBadgePanel(memberLevels.view(user.id),true),levelBadgeHtml:levelBadge(memberLevels.view(user.id)),recordsHtml:collectionShelf(records,true,'/me'),dashboardHtml:collectionDashboard(records,true,'/me'),progressHtml:collectionDashboard(records,true,'/me',false),badgesHtml:collectionBadgeBook(records),nudgeHtml:collectionNudge(records),counts:{all:records.overall,...records.counts},collection:records.collection,page:records.page,message:form.status==='done' ? '✓ 玩过印章已盖好。给故事留一句感想吧。' : form.status==='doing' ? '▶ 新的故事开始了，祝你玩得开心。' : '＋ 想玩的故事，已经收进格子。' },req);
    }
    if (pathname === '/api/battle/vote' || pathname === '/api/battle/cheer' || pathname === '/api/battle/cheer/delete') {
      if (!battle.canView(user)) throw new HttpError(404, '萌战活动尚未开放');
      try {
        if (pathname === '/api/battle/vote') await battle.vote(user.id, form);
        else if (pathname.endsWith('/delete')) await battle.removeCheer(user, form.id);
        else await battle.cheer(user.id, form);
        return back(pathname.endsWith('/vote') ? '选择已保存，截止前可以改投' : pathname.endsWith('/delete') ? '留言已删除' : '应援已发布', 'ok', '/battle');
      } catch (err) { return back(err.message, 'error', '/battle'); }
    }
    if (pathname === '/admin/battle/visibility') {
      if (!isSuperAdmin(user)) throw new HttpError(403, '只有超级管理员可以开关萌战入口');
      try {
        await battle.setVisibility(user, form.visible);
        return back(form.visible === '1' ? '萌战入口已开启' : '萌战入口已关闭', 'ok', '/admin/battle');
      } catch (err) { return back(err.message, 'error', '/admin/battle'); }
    }
    if (pathname === '/admin/battle/config' || pathname === '/admin/battle/settle') {
      if (!user.isAdmin) throw new HttpError(403, '只有站长可以配置活动');
      try {
        if (pathname.endsWith('/config')) await battle.configure(form);
        else await battle.settle(form);
        return back(pathname.endsWith('/config') ? '萌战设置已保存' : '本轮晋级已确认', 'ok', '/admin/battle');
      } catch (err) { return back(err.message, 'error', '/admin/battle'); }
    }

    if (pathname === '/api/email/bind') {
      try {
        await auth.bindEmail(user, form);
        return back('邮箱已验证并绑定，可用于找回密码。', 'ok', '/me#account-security');
      } catch (err) {
        return back(err instanceof AuthError ? err.message : '邮箱绑定失败，请稍后重试', 'error', '/me#account-security');
      }
    }

    if (pathname === '/api/record') {
      const game = gameOf(form.gid);
      const json=String(req.headers.accept||'').includes('application/json');
      if (!game){if(json)throw new HttpError(404,'作品不存在');return back('作品不存在', 'error', '/games');}
      if(json&&!limiter.allow(user.id+'|record-autosave',90))throw new HttpError(429,'操作过于频繁，请稍后保存');
      const patch=json?Object.fromEntries(['score','status','note'].filter(k=>Object.hasOwn(form,k)).map(k=>[k,form[k]])):form;
      const run = recordWrites.then(async()=>{const stream=recordStream(user,game,form);if(stream?.stale)return false;const changed=await saveRecord(db,user.id,game.id,patch);stream?.commit();return changed;});
      recordWrites = run.catch(() => {});
      try {
        const changed = await run;
        if(json)return sendJson(res,200,{saved:true,changed},req);
        return back(changed ? '游玩记录已保存' : '记录没有变化', 'ok', '/game/' + game.gid);
      } catch (err) {if(json)throw new HttpError(400,err.message);return back(err.message, 'error', '/game/' + game.gid); }
    }

    if (pathname === '/api/rate') {
      const game = gameOf(form.gid);
      if (!game) return back('作品不存在', 'error', '/games');
      const score = clampInt(form.score, 1, 10);
      if (!score) return back('请选择 1-10 的分数', 'error', `/game/${form.gid}`);
      const existing = db.ratingFor(user.id, game.id);
      if (existing) await db.ratings.update(existing.id, { score, prevScore: existing.score });
      else await db.ratings.insert({ userId: user.id, gameId: game.id, score });
      return back(`已给《${game.chineseName || game.name}》打 ${score} 分 · ${scoreLabel(score)}`, 'ok', `/game/${game.gid}`);
    }

    if (pathname === '/api/rate/delete') {
      const game = gameOf(form.gid);
      if (game) {
        const existing = db.ratingFor(user.id, game.id);
        if (existing) await db.ratings.remove(existing.id);
      }
      return back('评分已删除', 'ok', `/game/${form.gid}`);
    }

    if (pathname === '/api/review') {
      const game = gameOf(form.gid);
      if (!game) return back('作品不存在', 'error', '/games');
      const content = String(form.content || '').trim();
      if (content.length < 2 || content.length > 2000) return back('评价请填写 2—2000 字', 'error', `/game/${game.gid}#review-composer`);
      const patch = { content, title: String(form.title || '').trim() };
      const run = recordWrites.then(async()=>{const stream=recordStream(user,game,form);if(form.recordCapture==='1'&&!stream?.stale)for(const field of ['score','status','note'])if(Object.hasOwn(form,'record_'+field))patch[field]=form['record_'+field];const changed=await saveRecord(db,user.id,game.id,patch);stream?.commit();return changed;});
      recordWrites = run.catch(() => {});
      try {
        await run;
        return back('评价已保存', 'ok', `/game/${game.gid}#work-reviews`);
      } catch (err) { return back(err.message, 'error', `/game/${game.gid}#review-composer`); }
    }

    if (pathname === '/api/review/delete') {
      const game = gameOf(form.gid);
      if (game) {
        const existing = db.reviewForUser(user.id, game.id);
        if (existing) await db.reviews.remove(existing.id);
      }
      return back('评价已删除', 'ok', `/game/${form.gid}`);
    }

    if (pathname === '/api/checkin') {
      const game = gameOf(form.gid);
      if (!game) return back('作品不存在', 'error', '/games');
      const status = str(form.status, 12);
      if (status === 'clear') {
        for (const c of db.checkinsForUser(user.id, game.id)) await db.checkins.remove(c.id);
        return back('已清除打卡记录', 'ok', `/game/${game.gid}`);
      }
      const allowed = ['wish', 'doing', 'done', 'dropped'];
      if (!allowed.includes(status)) return back('状态不合法', 'error', `/game/${game.gid}`);
      const note = str(form.note, 120);
      const existing = db.checkinsForUser(user.id, game.id)[0];
      if (existing) await db.checkins.update(existing.id, { status, note: note || existing.note || '' });
      else await db.checkins.insert({ userId: user.id, gameId: game.id, status, note });
      const label = { wish: '想玩', doing: '在玩', done: '玩过', dropped: '弃坑' }[status];
      return back(`已标记为「${label}」`, 'ok', `/game/${game.gid}`);
    }

    if (pathname === '/api/game/refresh') {
      requireRemote();
      const game = gameOf(form.gid);
      if (!game) return back('作品不存在', 'error', '/games');
      if (/^(?:cn|vn|bg)/.test(String(game.gid)) && !game.ymgalGid) return back('当前使用本站保存的来源资料，不向月幕提交其他来源编号', 'ok', '/game/' + game.gid);
      remoteBudget(req, user, 'refresh', 5);
      try {
        const detail = await ymgal.gameDetail(game.ymgalGid || game.gid);
        if (String(detail?.gid) === String(game.ymgalGid || game.gid)) { await ymgal.cacheDetail(detail); await mediaClient.resolve(detail); }
        return back('已从月幕同步最新资料', 'ok', `/game/${game.gid}`);
      } catch (err) {
        return back(`同步失败：${err.message}`, 'error', `/game/${game.gid}`);
      }
    }

    /* ---------- 站长后台 ---------- */
    if (pathname === '/admin/invite') {
      if (!user.isAdmin) return redirect(res, '/');
      try {
        const invite = await auth.createInvite(user, { code: str(form.code, 20), note: str(form.note, 60), maxUses: form.maxUses || 1, memberSource: submittedMemberSource(form.memberSource, form.customMemberSource) });
        return back(`已生成注册码：${invite.code}`, 'ok', '/admin');
      } catch (err) {
        return back(err.message, 'error', '/admin');
      }
    }

    if (pathname === '/admin/invite/source') {
      if (!isSuperAdmin(user)) throw new HttpError(403, '仅超级管理员可修改注册来源');
      try {
        const updated = await auth.setInviteMemberSource(user, str(form.id, 64), submittedMemberSource(form.memberSource, form.customMemberSource));
        return back(updated ? '注册来源标记已保存' : '注册码不存在', updated ? 'ok' : 'error', '/admin');
      } catch (err) { return back(err.message, 'error', '/admin'); }
    }

    if (pathname === '/admin/users/source') {
      if (!isSuperAdmin(user)) throw new HttpError(403, '仅超级管理员可修改注册来源');
      try {
        const updated = await auth.setMemberRegistrationSource(user, str(form.id, 64), submittedMemberSource(form.memberSource, form.customMemberSource));
        return back(updated ? '成员注册来源已保存' : '成员不存在', updated ? 'ok' : 'error', '/admin/users');
      } catch (err) { return back(err.message, 'error', '/admin/users'); }
    }

    if (pathname === '/admin/invite/toggle') {
      if (!user.isAdmin) return redirect(res, '/');
      const updated = await auth.toggleInvite(user, str(form.id, 64), form.active === '1');
      return back(updated ? `注册码已${updated.active ? '启用' : '停用'}` : '注册码不存在', updated ? 'ok' : 'error', '/admin');
    }

    if (pathname === '/admin/import') {
      if (!user.isAdmin) return redirect(res, '/');
      const names = String(form.names || '')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 20);
      const log = [];
      for (const name of names) {
        try {
          const detail = await ymgal.resolveByKeyword(name);
          if (detail?.gid) {
            const saved = await ymgal.cacheDetail(detail);
            log.push(`✅ ${name} → gid ${saved.gid} ${saved.chineseName || saved.name}`);
          } else {
            log.push(`⚠️ ${name} → 未匹配到档案`);
          }
        } catch (err) {
          log.push(`❌ ${name} → ${err.message}`);
        }
      }
      return redirect(
        res,
        withFlash('/admin', `导入完成：成功 ${log.filter((l) => l.startsWith('✅')).length} / ${names.length}`, 'ok') +
          `&log=${encodeURIComponent(log.join('\n'))}`,
      );
    }

    return sendJson(res, 404, { error: '未知的提交地址' }, req);
  }

  /* --------------------------- 静态文件 --------------------------- */

  async function serveStatic(req, res, url) {
    // Never serve a flagged original from the old public URL, even to a
    // signed-in request. Viewing it must use the private, non-cacheable route.
    const canonicalPath = path.posix.normalize(decodeURIComponent(url.pathname));
    if (protectedCoverPath(canonicalPath, [...db.games.all(), ...searchWorks.values()])) throw new HttpError(404, '资源不存在');
    if (/^\/img\/cover-masks\/[a-f0-9]{20}\.webp$/.test(url.pathname)) {
      const cover = maskSource(url.pathname, [...db.games.all(), ...searchWorks.values()]);
      if (!cover) throw new HttpError(404, '资源不存在');
      const bytes = await coverImages.masked(cover);
      res.writeHead(200, { 'Content-Type': 'image/webp', 'Content-Length': bytes.length, 'Cache-Control': 'public, max-age=86400' });
      res.end(req.method === 'HEAD' ? undefined : bytes); return true;
    }
    const isWorker = url.pathname === '/resource-cache.js';
    const bundled = isWorker ? pwaWorker : browserAssets.get(url.pathname);
    if (bundled) {
      const headers = { 'Content-Type': bundled.type, 'Cache-Control': isWorker ? 'no-cache' : 'public, max-age=31536000, immutable', ETag: bundled.etag };
      if (isWorker) headers['Service-Worker-Allowed'] = '/';
      if (req.headers['if-none-match']?.split(',').map(value => value.trim().replace(/^W\//, '')).some(value => value === bundled.etag || value === '*')) {
        res.writeHead(304, headers); res.end(); return true;
      }
      res.writeHead(200, { ...headers, 'Content-Length': bundled.content.length });
      res.end(req.method === 'HEAD' ? undefined : bundled.content); return true;
    }
    const rel = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    if (rel.includes('..')) throw new HttpError(400, '非法路径');
    if (rel.includes('\\') || rel.includes('\0')) throw new HttpError(400, '非法路径');
    let filePath;
    if (rel.startsWith('img/uploads/')) {
      const name = rel.slice('img/uploads/'.length);
      if (!/^[a-f0-9]{32}\.(png|jpg|webp|gif)$/.test(name)) throw new HttpError(404, '资源不存在');
      filePath = path.join(uploadDir, name);
    } else if (rel.startsWith('img/work-cache/')) {
      const name = rel.slice('img/work-cache/'.length);
      if (!/^[a-f0-9]{20}\.jpg$/.test(name)) throw new HttpError(404, '资源不存在');
      filePath = path.join(dataDir, 'media-images', name);
    } else {
      filePath = path.resolve(publicDir, rel);
      if (!filePath.startsWith(publicDir + path.sep)) throw new HttpError(400, '非法路径');
    }
    if (!existsSync(filePath)) return false;
    const info = await stat(filePath);
    if (!info.isFile()) return false;
    const ext = path.extname(filePath).toLowerCase();
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': /^\/fonts\/list-song\/noto-serif-sc-[a-f0-9]{16}\.woff2$/.test(url.pathname)?'public, max-age=31536000, immutable':['.css', '.js', '.webmanifest', '.html'].includes(ext) ? 'no-cache' : 'public, max-age=86400',
      ETag: `W/"${info.size.toString(16)}-${Math.trunc(info.mtimeMs).toString(16)}"`,
      'Last-Modified': info.mtime.toUTCString(),
    };
    if (url.pathname === '/resource-cache.js') headers['Service-Worker-Allowed'] = '/';
    if (!req.headers.range && (
      req.headers['if-none-match']
        ? req.headers['if-none-match'].split(',').map(value => value.trim().replace(/^W\//, '')).some(value => value === headers.ETag.replace(/^W\//, '') || value === '*')
        : req.headers['if-modified-since'] && info.mtimeMs < Date.parse(req.headers['if-modified-since']) + 1000
    )) {
      delete headers['Content-Length']; res.writeHead(304, headers); res.end(); return true;
    }
    if (ext === '.mp4' || ext === '.mp3') {
      headers['Accept-Ranges'] = 'bytes';
      const range = req.headers.range;
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        let start = 0, end = info.size - 1;
        if (!match || (!match[1] && !match[2])) {
          res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); res.end(); return true;
        }
        if (!match[1]) start = Math.max(0, info.size - Number(match[2]));
        else { start = Number(match[1]); if (match[2]) end = Math.min(Number(match[2]), end); }
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= info.size || start > end || Number(match[2]) === 0 && !match[1]) {
          res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); res.end(); return true;
        }
        headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
        headers['Content-Length'] = end - start + 1;
        res.writeHead(206, headers);
        if (req.method === 'HEAD') res.end(); else createReadStream(filePath, { start, end }).pipe(res);
        return true;
      }
    }
    res.writeHead(200, headers);
    if (req.method === 'HEAD') res.end(); else createReadStream(filePath).pipe(res);
    return true;
  }

  /* --------------------------- 请求入口 --------------------------- */

  const server = http.createServer((req,res)=>workPresentationContext.run({bangumi:bangumiCatalogue},()=>workCorrectionContext.run(workCorrections,async()=>{
    let url;
    let currentUser = null;

    try {
      securityHeaders(res, config);
      url = parseUrl(req);
      runtimeStatus.observe(req,res,url.pathname);
      trafficProtection.observe(req,res,url.pathname);
      if (db.pg?.lockFailure) throw new HttpError(503, '数据连接正在恢复，请稍后重试');
      req.cookies = parseCookies(req.headers.cookie);
      requestSecurity(req, config);
      if((req.method==='GET'||req.method==='HEAD')&&url.pathname==='/api/pilgrimage/works'){
        if(!pilgrimage.enabled)throw new HttpError(404,'巡礼手账尚未开放');
        const headers={'Content-Type':'text/html; charset=utf-8','Cache-Control':'public, max-age=300',ETag:pilgrimageLibraryEtag};
        if(req.headers['if-none-match']===pilgrimageLibraryEtag){res.writeHead(304,headers);return res.end();}
        res.writeHead(200,{...headers,'Content-Length':Buffer.byteLength(pilgrimagePublicLibrary)});return res.end(req.method==='HEAD'?undefined:pilgrimagePublicLibrary);
      }
      if((req.method==='GET'||req.method==='HEAD')&&url.pathname==='/api/pilgrimage/image'){
        if(!pilgrimage.enabled)throw new HttpError(404,'巡礼手账尚未开放');
        const book=pilgrimage.books.find(b=>b.subjectId===Number(url.searchParams.get('subject'))),kind=url.searchParams.get('kind'),point=book?.points.find(p=>p.id===url.searchParams.get('point'));
        const source=safePilgrimageURL(kind==='cover'?book?.cover:kind==='scene'?point?.image:null);
        if(!source||!['image.anitabi.cn','bgm-api.anitabi.cn','lain.bgm.tv'].includes(new URL(source).hostname))throw new HttpError(404,'未找到这张图片');
        if(!limiter.allow(`${req.clientIp}|pilgrimage-image`,240))throw new HttpError(429,'图片请求过于频繁，请稍后再试');
        // Cold caches must not hold an image behind the download queue. The
        // browser can display the public original while we prepare the cache.
        if(!await pilgrimage.screenshots.hasCached(source,kind)){
          pilgrimage.screenshots.image(source,kind).catch(()=>{});
          res.writeHead(302,{Location:source,'Cache-Control':'no-store'});return res.end();
        }
        const bytes=await pilgrimage.screenshots.image(source,kind),etag='"'+createHash('sha256').update(bytes).digest('hex').slice(0,20)+'"';
        const headers={'Content-Type':'image/webp','Cache-Control':'public, max-age=86400',ETag:etag};
        if(req.headers['if-none-match']===etag){res.writeHead(304,headers);return res.end();}
        res.writeHead(200,{...headers,'Content-Length':bytes.length});return res.end(req.method==='HEAD'?undefined:bytes);
      }
      const sensitive = ['/login', '/register', '/forgot-password', '/api/email/send', '/api/email/bind', '/api/game/refresh'].includes(url.pathname);
      if (req.method === 'POST' && !limiter.allow(`${req.clientIp}|${sensitive ? 'auth' : 'write'}`, sensitive ? 40 : 1000)) throw new HttpError(429, '请求过于频繁，请稍后再试');
      // 静态资源
      if ((req.method === 'GET' || req.method === 'HEAD') && !url.pathname.startsWith('/api/')) {
        const characterMask=portraitMaskFor(url.pathname);if(characterMask){res.writeHead(302,{Location:characterMask,'Cache-Control':'public, max-age=3600'});return res.end();}
        const m = url.pathname.match(/^\/(css|js|img|media|fonts)\/.+$/);
        if (m || ['/resource-cache.js', '/manifest.webmanifest', '/offline.html', '/favicon.ico', '/apple-touch-icon.png'].includes(url.pathname)) {
          const served = await serveStatic(req, res, url).catch(() => false);
          if (served) return;
          throw new HttpError(404, '资源不存在');
        }
      }

      const authenticated = await auth.currentUser(req);
      if (authenticated) {
        await memberLevels.sync(authenticated.id);
        currentUser = {...authenticated,progress:memberLevels.view(authenticated.id),notificationCount:reviewCommunity.unread(authenticated.id)};
      }

      const ctx = { user: currentUser, sessionId: req.sessionId };
      req.showOriginalCovers=currentUser?.showOriginalCovers===true;

      if (req.method === 'GET' || req.method === 'HEAD') {
        return await handlePage(req, res, url, ctx);
      }

      if (req.method === 'POST') {
        if (url.pathname === '/api/me/story-card') {
          if (!currentUser) throw new HttpError(401, '请先登录');
          if (!limiter.allow(currentUser.id + '|story-card-save', 25)) throw new HttpError(429, '保存过于频繁，请稍后再试');
          if (String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') {
            throw new HttpError(415, '资历卡仅保存文字和选项');
          }
          const raw = await readBody(req, 16 * 1024);
          let input;
          try { input = JSON.parse(raw); } catch { throw new HttpError(400, '资历卡资料格式不正确'); }
          const saved = await saveStoryCard(db, currentUser.id, input, {
            resolveWork: storyWork,
            resolveCharacter: ref => {
              const known = storyCharacters.knownCharacter(ref);
              if (known) return known;
              remoteBudget(req, currentUser, 'story-character-detail', 30);
              return storyCharacters.character(ref);
            },
          });
          const card = storyCardData(db, { ...currentUser, storyCard: saved }, storyWork);
          return sendJson(res, 200, { revision: card.revision, savedAt: card.savedAt, draft: card.draft }, req);
        }
        if (url.pathname === '/admin/site/upload' || url.pathname === '/api/battle/image') {
          if (!isSuperAdmin(currentUser)) throw new HttpError(403, '只有超级管理员可以上传素材');
          if (!limiter.allow(`${req.clientIp}|upload`, 10)) throw new HttpError(429, '上传过于频繁，请稍后再试');
          if (url.pathname === '/api/battle/image') {
            try { const image = await content.upload(currentUser, req); return sendJson(res, 201, { image }, req); }
            catch (err) { if (err.code) throw err; return sendJson(res, err.status || 400, { error: err.message }, req); }
          }
          try { const image = await content.upload(currentUser, req); return redirect(res, withFlash('/admin/site', `图片已上传：${image}`, 'ok')); }
          catch (err) { if (err.status === 413) throw err; return redirect(res, withFlash('/admin/site', err.message, 'error')); }
        }
        if (String(req.headers['content-type'] || '').startsWith('multipart/')) throw new HttpError(415, '此接口不接收文件');
        const raw = await readBody(req);
        const form = parseForm(raw);
        return await handlePost(req, res, url, ctx, form);
      }

      throw new HttpError(405, '不支持的请求方法');
    } catch (err) {
      const status = Number.isInteger(err.status) && err.status >= 400 && err.status <= 599 ? err.status : 500;
      if(Number.isInteger(err.retryAfter)&&err.retryAfter>0&&err.retryAfter<=3600)res.setHeader('Retry-After',String(err.retryAfter));
      if (status >= 500 && !err.retryAfter) {
        console.error('[error]', req.method, url?.pathname, err.message);
      }
      if (res.headersSent) return;
      const message = status >= 500 && !err.retryAfter ? '服务器暂时无法处理请求，请稍后重试' : err.message;
      const wantsJson = url?.pathname.startsWith('/api/');
      if (wantsJson) return sendJson(res, status, { error: message, ...(url?.pathname.startsWith('/api/music/') && err.musicCode ? {musicCode:err.musicCode,...(err.musicCode==='duplicate'?{editUrl:err.editUrl}:err.musicCode==='edit-conflict'?{latest:err.latest}:err.musicCode==='reply-conflict'?{replyUrl:err.replyUrl}:{})} : {}) }, req);
      const html = views.layout({
        config,
        user: currentUser,
        battleVisible: battle.canView(currentUser),
        title: '出错了',
        body: views.pageError({ status, message }),
      });
      return sendHtml(res, status, html, {}, req);
    }
  })));

  server.requestTimeout = 30000;
  trafficProtection.start();
  server.once('close',()=>{runtimeStatus.close();trafficProtection.close();});
  server.headersTimeout = 15000;
  server.maxHeadersCount = 80;
  const drain = async () => {
    runtimeStatus.close();
    trafficProtection.close();
    await workEnrichment.stop();
    await pilgrimage.screenshots.stop();
    await steamProfile.stop();
    await workOffers.stop();
    await workCatalogue.stop();
    await musicPlayer.stop();
    await musicSource.stop();
    await musicSharing.stop();
    await trafficProtection.queue;
    await workCorrections.queue;
    await workLists.queue;await storyCharacters.stop();
    await Promise.all([recordWrites,reviewCommunity.queue,tasteDiscovery.queue,memberLevels.queue,pilgrimage.queue,characterBirthdays.queue,steam.queue,...steam.verifying,emailVerification.writes,ymgal.discoveryWrites,...mediaClient.pending.values()]);
    await mediaClient.saving;
    await Promise.all(db.collections.map(collection=>collection.writes));
  };
  return { server, db, auth, ymgal, mediaClient, config, invite, emailVerification, mailer, battle, content, annualAnalysis, memberLevels, pilgrimage, characterBirthdays, steam,steamProfile,bangumiImport,reviewCommunity,tasteDiscovery,domesticWorks,workRelations,workOffers,workCatalogue,vnCatalogue,musicPlayer,musicSource,musicSharing,runtimeStatus,trafficProtection,workCorrections,workEnrichment,collectedCatalogue,workLists,bangumiCharacters,storyCharacters,drain };
}

/* ------------------------------------------------------------------ *
 * 启动
 * ------------------------------------------------------------------ */

export async function startServer() {
  const { server, config, db, invite, drain } = await createApp();
  db.pg?.onLockLost(() => {
    console.error('[postgres] 写入锁丢失，停止服务；重启后重新加载数据');
    server.close();
    server.closeAllConnections?.();
    process.exit(1);
  });
  const host = process.env.HOST || config.site.host || '127.0.0.1';
  const port = Number(process.env.PORT || config.site.port || 8787);

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });

  let stopping = false;
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
    if (stopping) return; stopping = true;
    server.close(async () => {
      await drain();
      await db.close();
      process.exit(0);
    });
    server.closeIdleConnections?.();
    setTimeout(() => process.exit(1), 28000).unref();
  });

  const url = `http://${host}:${port}`;
  console.log('');
  console.log(`  ${config.site.name} 已启动 → ${url}`);
  console.log(`  本地作品 ${db.games.all().length} 部 · 成员 ${db.users.all().length} 人`);
  const usable = db.usableInvites();
  if (usable.length) {
    console.log('');
    console.log(`  可用注册码 ${usable.length} 个，可在 /admin 查看。`);
  } else {
    console.log('  ⚠️  当前没有可用注册码，请用站长账号在 /admin 生成。');
  }
  console.log('');
  return { server, url };
}

export { ROOT };

/* 直接用 `node src/server.js` 启动 */
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  startServer().catch((err) => {
    console.error('启动失败：', err);
    // 显式退出：PostgreSQL 连接与写入锁不能让失败的进程继续挂着。
    process.exit(1);
  });
}
