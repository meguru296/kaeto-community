import {AsyncLocalStorage} from 'node:async_hooks';
// Per-request presentation only; background synchronization always keeps source data.
export const workCorrectionContext=new AsyncLocalStorage();
