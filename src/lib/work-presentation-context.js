import {AsyncLocalStorage} from 'node:async_hooks';
// Raw provider artwork stays server-side. Viewer choices are applied only at
// the final HTTP response, never to shared catalogue or list snapshots.
export const workPresentationContext=new AsyncLocalStorage();
export function viewerCoverLinks(content,enabled){return enabled?content.replaceAll(/\/img\/cover-masks\/([a-f0-9]{20})\.webp/g,'/api/cover/display/$1.webp'):content;}
