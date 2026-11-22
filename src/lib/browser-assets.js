import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Preserve the stylesheet cascade and deferred script order. Build once per
// process, so normal starts and releases never depend on generated files.
const styles = ['app', 'design', 'community', 'redesign', 'work-design', 'member-design', 'catalog-design', 'avatars', 'account-security', 'battle-design', 'site-admin', 'annual-analysis', 'policies', 'theme', 'member-collection', 'member-levels', 'mobile-polish', 'pilgrimage', 'navigation', 'updates', 'character-birthdays', 'member-workspace', 'external-accounts', 'review-social', 'taste-discovery', 'work-connections', 'music-player'];
const scripts = ['app', 'motion', 'community', 'redesign', 'work-design', 'member-design', 'avatars', 'review-editor', 'account-security', 'battle-design', 'site-admin', 'image-protection', 'resource-cache', 'policies', 'pilgrimage', 'pilgrimage-tools', 'character-birthdays', 'external-accounts', 'review-social', 'taste-discovery', 'work-connections', 'record-autosave', 'music-player', 'music-sharing'];
styles.push('music-sharing', 'music-room');
styles.push('work-walkthrough', 'pwa', 'traffic-protection');
styles.push('work-corrections');
styles.push('guest-welcome');
styles.push('adieu-entry','adieu-walkthrough');
styles.push('work-list-fonts','work-lists','work-list-entries');
styles.push('account-menu');
styles.push('work-list-collaboration','playing-members','story-card');
scripts.push('work-corrections','work-enrichment','review-stickers');
scripts.push('work-walkthrough','muramasa-flowchart');
scripts.push('guest-welcome');
scripts.push('adieu-walkthrough');
scripts.push('work-lists');
scripts.push('account-menu');
scripts.push('work-list-collaboration','story-card');
function bundle(names, kind) {
  const content = Buffer.from(names.map(name => readFileSync(new URL(`../../public/${kind}/${name}.${kind}`, import.meta.url), 'utf8')).join(kind === 'js' ? '\n;\n' : '\n'));
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 20);
  return { url: `/${kind}/site-${hash}.${kind}`, content, etag: `"${hash}"`, type: kind === 'css' ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8' };
}
export const browserStyles = bundle(styles, 'css');
export const browserScripts = bundle(scripts, 'js');
// Work-specific assets are requested only by this work's detail and pilgrimage pages.
export const subahibiStyles = bundle(['subahibi'], 'css');
export const subahibiScripts = bundle(['subahibi'], 'js');
export const shopStyles = bundle(['shop'], 'css');
export const shopScripts = bundle(['shop'], 'js');
export const runtimeStyles = bundle(['runtime-admin'], 'css');
export const runtimeScripts = bundle(['runtime-admin'], 'js');
// A small, cached head script chooses the palette before the first paint.
// Keeping it external preserves the site's strict script CSP.
export const browserTheme = bundle(['theme'], 'js');
export const browserAssets = new Map([browserStyles, browserScripts, browserTheme, subahibiStyles, subahibiScripts, shopStyles, shopScripts, runtimeStyles, runtimeScripts].map(asset => [asset.url, asset]));

// Keep the original cascade order within every profile. Shared historical
// styles (including footer, theme and admin toolbar rules) remain shared.
const optionalStyles=new Set(['adieu-entry','adieu-walkthrough','avatars','catalog-design','battle-design','annual-analysis','pilgrimage','character-birthdays','taste-discovery','work-connections','music-player','music-sharing','music-room','work-walkthrough','work-corrections']);
optionalStyles.add('work-lists');
optionalStyles.add('work-list-fonts');
optionalStyles.add('work-list-entries');
optionalStyles.add('work-list-collaboration');
optionalStyles.add('story-card');optionalStyles.add('playing-members');
const optionalScripts={
 'story-card':'story-card',
  'work-lists':'work-lists',
  'work-list-collaboration':'work-lists',
  'adieu-walkthrough':'adieu-walkthrough',
  'battle-design':'battle-design',pilgrimage:'pilgrimage','pilgrimage-tools':'pilgrimage',
  'character-birthdays':'character-birthdays','taste-discovery':'taste-discovery',
  'work-connections':'work-connections','music-player':'music-player','music-sharing':'music-sharing',
  'work-walkthrough':'work-walkthrough','muramasa-flowchart':'work-walkthrough',
  'work-corrections':'work-corrections','work-enrichment':'work-connections',
};
const profiles={
  lists:['work-list-fonts','work-lists','work-list-collaboration'],
  home:['character-birthdays','playing-members'],
  editorial:[],
  catalog:['catalog-design','playing-members'],
  storyCard:['story-card','work-list-fonts'],
  work:['catalog-design','work-connections','music-player','music-sharing','music-room','work-walkthrough','work-corrections','pilgrimage','adieu-entry','work-list-entries'],
  profile:['avatars','annual-analysis','pilgrimage','character-birthdays','taste-discovery','work-list-entries'],
  pilgrimage:['pilgrimage'],birthdays:['character-birthdays'],
  music:['music-player','music-sharing','music-room'],
  guide:['work-walkthrough'],corrections:['work-corrections'],
  adieuGuide:['adieu-walkthrough'],
};
const pageBundles=new Map(Object.entries(profiles).map(([name,modules])=>{
  const enabled=new Set(modules);
  const pair={styles:bundle(styles.filter(n=>!optionalStyles.has(n)||enabled.has(n)),'css'),scripts:bundle(scripts.filter(n=>!optionalScripts[n]||enabled.has(optionalScripts[n])),'js')};
  for(const asset of Object.values(pair))browserAssets.set(asset.url,asset);
  return [name,pair];
}));
export function pageAssets({active='',bodyClass='',body=''}){
  let profile;
  if(body.includes('data-story-studio'))profile='storyCard';
  else if(bodyClass.includes('work-lists-page')||body.includes('data-work-lists'))profile='lists';
  else if(body.includes('data-adieu-guide'))profile='adieuGuide';
  else if(body.includes('data-muramasa-guide'))profile='guide';
  else if(body.includes('class="wc-page'))profile='corrections';
  else if(bodyClass.includes('work-detail-page'))profile='work';
  else if(active==='home')profile='home';
  else if(active==='games'||active==='rank')profile='catalog';
  else if(active==='music')profile='music';
  else if(active==='pilgrimage')profile='pilgrimage';
  else if(body.includes('class="cb-page')||body.includes('data-birthday-page'))profile='birthdays';
  else if(active==='collection'||/member-(?:page|workspace)|profile-page/.test(bodyClass)||body.includes('class="mr-')||body.includes('class="td-')||body.includes('class="ya-'))profile='profile';
  else if(['festival','journal','about','shop','annual'].includes(active))profile='editorial';
  return pageBundles.get(profile)||{styles:browserStyles,scripts:browserScripts};
}
