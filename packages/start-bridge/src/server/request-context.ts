import { AsyncLocalStorage } from 'node:async_hooks';
import type { BridgeRequestContext } from '../core/request-context';
import { installRequestStore } from './request-store';

const clientBuild =
  (import.meta as { env?: { START_BRIDGE_CLIENT?: boolean } }).env
    ?.START_BRIDGE_CLIENT === true;
if (!clientBuild)
  installRequestStore(new AsyncLocalStorage<BridgeRequestContext>());

export * from '../core/request-context';
export { installRequestStore } from './request-store';
export { cookies } from './request-cookies';
