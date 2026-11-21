import { AsyncLocalStorage } from 'node:async_hooks';
import { afterEach, expect, it } from 'vitest';
import { appBaseHeadScript } from '../start/base-path';
import {
  APP_BASE_GLOBAL,
  installAppBaseResolver,
  runtimeAppBase,
} from './app-url';

type BaseGlobal = { [APP_BASE_GLOBAL]?: unknown };
const global = globalThis as BaseGlobal;
const saved = global[APP_BASE_GLOBAL];

afterEach(() => {
  global[APP_BASE_GLOBAL] = saved;
});

// An app's own request store (Meet's) and the bridge store can both install a
// resolver in one Worker. The later one must not erase the earlier one's base;
// otherwise the mounted document head renders `__tuturuuuAppBase=""` and the
// browser fetches runtime assets from the apex root.
it('keeps an earlier resolver answering when a later one has no request', () => {
  delete global[APP_BASE_GLOBAL];
  const appStore = new AsyncLocalStorage<{ basePath: string }>();
  const bridgeStore = new AsyncLocalStorage<{ appBase?: string }>();
  installAppBaseResolver(() => appStore.getStore()?.basePath);
  installAppBaseResolver(() => bridgeStore.getStore()?.appBase);

  appStore.run({ basePath: '/meet' }, () => {
    expect(runtimeAppBase()).toBe('/meet');
    expect(appBaseHeadScript(undefined, 'n').children).toBe(
      'globalThis.__tuturuuuAppBase="/meet";'
    );
  });
  appStore.run({ basePath: '' }, () => expect(runtimeAppBase()).toBe(''));
  bridgeStore.run({ appBase: '/tools' }, () =>
    expect(runtimeAppBase()).toBe('/tools')
  );
  expect(runtimeAppBase()).toBe('');
});

it('works in either install order', () => {
  delete global[APP_BASE_GLOBAL];
  const appStore = new AsyncLocalStorage<{ basePath: string }>();
  const bridgeStore = new AsyncLocalStorage<{ appBase?: string }>();
  installAppBaseResolver(() => bridgeStore.getStore()?.appBase);
  installAppBaseResolver(() => appStore.getStore()?.basePath);
  appStore.run({ basePath: '/meet' }, () =>
    expect(runtimeAppBase()).toBe('/meet')
  );
  bridgeStore.run({ appBase: '/lms' }, () =>
    expect(runtimeAppBase()).toBe('/lms')
  );
});

it('replaces a browser head-script string instead of chaining it', () => {
  global[APP_BASE_GLOBAL] = '/stale';
  installAppBaseResolver(() => undefined);
  expect(runtimeAppBase()).toBe('');
});
