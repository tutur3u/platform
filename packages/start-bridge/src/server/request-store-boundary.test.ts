import { AsyncLocalStorage } from 'node:async_hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_BASE_GLOBAL, runtimeAppBase } from '../core/app-url';
import { requestNonce } from '../core/csp';
import {
  type BridgeRequestContext,
  bridgeRequest,
  createRequestLocal,
  maybeBridgeRequest,
  REQUEST_STORE_KEY,
  withBridgeRequest,
} from '../core/request-context';
import { installRequestStore } from './request-store';

const anchor = globalThis as typeof globalThis & {
  [REQUEST_STORE_KEY]?: AsyncLocalStorage<BridgeRequestContext>;
};
const baseKey = APP_BASE_GLOBAL;
const globals = globalThis as typeof globalThis & { [baseKey]?: unknown };
const savedStore = anchor[REQUEST_STORE_KEY];
const savedBase = globals[baseKey];
afterEach(() => {
  if (savedStore) anchor[REQUEST_STORE_KEY] = savedStore;
  else delete anchor[REQUEST_STORE_KEY];
  if (savedBase === undefined) delete globals[baseKey];
  else globals[baseKey] = savedBase;
});

describe('request reader and installation boundary', () => {
  it('leaves absent stores absent and fails closed', () => {
    delete anchor[REQUEST_STORE_KEY];
    expect(maybeBridgeRequest()).toBeUndefined();
    expect(requestNonce()).toBeUndefined();
    const local = createRequestLocal<string>('absent');
    expect(local.get()).toBeUndefined();
    expect(() => local.set('value')).toThrow('context unavailable');
    expect(() => bridgeRequest()).toThrow('context unavailable');
    expect(() =>
      withBridgeRequest(new Request('https://x.test'), () => {})
    ).toThrow('store is not installed');
    expect(anchor[REQUEST_STORE_KEY]).toBeUndefined();
  });

  it('keeps the first store and isolates nested and concurrent nonce/base/locals', async () => {
    delete anchor[REQUEST_STORE_KEY];
    const first = new AsyncLocalStorage<BridgeRequestContext>();
    expect(installRequestStore(first)).toBe(first);
    expect(
      installRequestStore(new AsyncLocalStorage<BridgeRequestContext>())
    ).toBe(first);
    const local = createRequestLocal<string>('actor');
    let release = () => {};
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const work = (actor: string) =>
      withBridgeRequest(
        {
          request: new Request(`https://x.test/${actor}`),
          nonce: actor,
          appBase: `/${actor}`,
        },
        async () => {
          local.set(actor);
          await barrier;
          expect(requestNonce()).toBe(actor);
          expect(runtimeAppBase()).toBe(`/${actor}`);
          expect(local.get()).toBe(actor);
          withBridgeRequest(
            { request: new Request('https://x.test/nested'), nonce: 'nested' },
            () => {
              expect(requestNonce()).toBe('nested');
              expect(local.get()).toBeUndefined();
            }
          );
          expect(requestNonce()).toBe(actor);
          expect(local.get()).toBe(actor);
        }
      );
    const pending = [work('alpha'), work('beta')];
    release();
    await Promise.all(pending);
    expect(maybeBridgeRequest()).toBeUndefined();
    expect(requestNonce()).toBeUndefined();
    expect(local.get()).toBeUndefined();
  });
});

describe('legacy server shim bootstrap', () => {
  it('installs request state through headers before the public core runner', async () => {
    delete anchor[REQUEST_STORE_KEY];
    vi.resetModules();
    const { headers } = await import('../next/headers');
    const { withBridgeRequest: run } =
      await import('../core/request-context-compat');
    await run(
      new Request('https://x.test', { headers: { 'x-boundary': 'ready' } }),
      async () => {
        expect((await headers()).get('x-boundary')).toBe('ready');
      }
    );
  });
});
