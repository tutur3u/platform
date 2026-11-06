import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_BASE_GLOBAL, installAppBaseResolver } from '../core/app-url';
import { withBridgeRequest } from '../server/request-context';
import {
  appBaseHeadScript,
  appPath,
  appUrl,
  bridgeServerFnFetch,
  routerBasepath,
  runtimeAppBase,
  withAppBase,
} from './base-path';

const resolver = (globalThis as Record<string, unknown>)[APP_BASE_GLOBAL];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  installAppBaseResolver(resolver as () => string | undefined);
});

describe('runtime app base', () => {
  it('is the identity at the root and outside a request', () => {
    expect(runtimeAppBase()).toBe('');
    expect(routerBasepath()).toBe('/');
    expect(withAppBase('/login')).toBe('/login');
    expect(appUrl('/r/x', 'https://meet.tuturuuu.com')).toBe(
      'https://meet.tuturuuu.com/r/x'
    );
  });

  it('follows the request context on the server, per request', async () => {
    const seen = await Promise.all(
      ['', '/meet'].map((appBase) =>
        withBridgeRequest(
          { request: new Request('https://x.test'), appBase },
          async () => {
            await Promise.resolve();
            return [routerBasepath(), appPath('/api/x'), appBaseHeadScript()];
          }
        )
      )
    );
    expect(seen).toEqual([
      ['/', '/api/x', { children: 'globalThis.__tuturuuuAppBase="";' }],
      [
        '/meet',
        '/meet/api/x',
        { children: 'globalThis.__tuturuuuAppBase="/meet";' },
      ],
    ]);
  });

  it('reads the serialized document base in the browser', () => {
    (globalThis as Record<string, unknown>)[APP_BASE_GLOBAL] = '/meet';
    expect(runtimeAppBase()).toBe('/meet');
    expect(appPath('/r/x?y=1')).toBe('/meet/r/x?y=1');
    expect(appUrl('/share/x', 'https://tuturuuu.com')).toBe(
      'https://tuturuuu.com/meet/share/x'
    );
  });

  it('falls back to the build-time default only without a runtime base', () => {
    (globalThis as Record<string, unknown>)[APP_BASE_GLOBAL] = undefined;
    vi.stubEnv('VITE_TUTURUUU_BASE_PATH', '/calendar');
    expect(runtimeAppBase()).toBe('/calendar');
  });

  it('escapes the head script and routes server functions through the base', async () => {
    expect(appBaseHeadScript('</script>' as string).children).not.toContain(
      '</script>'
    );
    (globalThis as Record<string, unknown>)[APP_BASE_GLOBAL] = '/meet';
    const fetchSpy = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response('ok')
    );
    vi.stubGlobal('fetch', fetchSpy);
    await bridgeServerFnFetch('/_serverFn/abc?x=1', { method: 'POST' });
    await bridgeServerFnFetch(new URL('https://tuturuuu.com/_serverFn/abc'));
    expect(fetchSpy.mock.calls.map((call) => String(call[0]))).toEqual([
      '/meet/_serverFn/abc?x=1',
      'https://tuturuuu.com/meet/_serverFn/abc',
    ]);
  });
});

describe('createApiPath', () => {
  it('bases app-owned endpoints only; Web-owned and centralFirst stay relative', async () => {
    const { createApiPath } = await import('../core/app-url');
    const apiPath = createApiPath(
      ['/api/workspaces/[wsId]', '/api/contacts/[id]'],
      ['/api/workspaces/invitations']
    );
    (globalThis as Record<string, unknown>)[APP_BASE_GLOBAL] = '/contacts';
    expect(apiPath('/api/contacts/1?x=1')).toBe('/contacts/api/contacts/1?x=1');
    expect(apiPath('/api/workspaces/invitations')).toBe(
      '/api/workspaces/invitations'
    );
    expect(apiPath('/api/v1/users/me')).toBe('/api/v1/users/me');
    (globalThis as Record<string, unknown>)[APP_BASE_GLOBAL] = '';
    expect(apiPath('/api/contacts/1')).toBe('/api/contacts/1');
  });
});
