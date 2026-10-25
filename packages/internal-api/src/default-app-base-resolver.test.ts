import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  APP_BASE_GLOBAL,
  appPath,
  appUrl,
} from '../../start-bridge/src/core/app-url';
import {
  bridgeRequest,
  withBridgeRequest,
} from '../../start-bridge/src/core/request-context';
import {
  createInternalApiClient,
  internalApiClient,
  registerDefaultAppBaseResolver,
  resolveInternalApiUrl,
  withContactsApiBaseUrl,
  withEducationBootstrapBaseUrl,
  withFinanceApiBaseUrl,
  withLearnApiBaseUrl,
  withMailApiBaseUrl,
  withPayApiBaseUrl,
  withTaskApiBaseUrl,
  withTeachApiBaseUrl,
} from './client';
import { listMailMessages } from './mail';
import { getMeetPlanSnapshot } from './meet';

const unregisterCallbacks: Array<() => void> = [];
function register(
  resolver: Parameters<typeof registerDefaultAppBaseResolver>[0]
) {
  const unregister = registerDefaultAppBaseResolver(resolver);
  unregisterCallbacks.push(unregister);
  return unregister;
}

function mockFetch() {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({}));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

function registerServerResolver() {
  register((path) => appUrl(path, bridgeRequest().request.url));
}

describe('default app base resolver', () => {
  afterEach(() => {
    for (const unregister of unregisterCallbacks.splice(0)) unregister();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each(['', '/meet', '/mail'])(
    'resolves browser paths at %s without double prefixing',
    async (base) => {
      vi.stubGlobal('window', {});
      vi.stubGlobal(APP_BASE_GLOBAL, base);
      const fetch = mockFetch();
      register(appPath);

      const path = '/api/meet-call/token?mode=call#room';
      expect(resolveInternalApiUrl(path)).toBe(`${base}${path}`);
      expect(resolveInternalApiUrl(`${base}${path}`)).toBe(`${base}${path}`);
      await internalApiClient.fetch('api/meet-call/token', {
        query: { mode: 'call' },
      });
      expect(fetch).toHaveBeenCalledWith(
        `${base}/api/meet-call/token?mode=call`,
        expect.anything()
      );
    }
  );

  it.each(['', '/meet', '/mail'])(
    'resolves SSR against the incoming host at %s instead of the Web origin',
    async (base) => {
      vi.stubEnv('INTERNAL_WEB_API_ORIGIN', 'https://web.example.com');
      const fetch = mockFetch();
      registerServerResolver();

      await withBridgeRequest(
        {
          request: new Request('https://incoming.example.com/page'),
          appBase: base,
        },
        async () => {
          expect(resolveInternalApiUrl('/api/meet-call/token')).toBe(
            `https://incoming.example.com${base}/api/meet-call/token`
          );
          await getMeetPlanSnapshot('plan-1');
        }
      );
      expect(fetch).toHaveBeenCalledWith(
        `https://incoming.example.com${base}/api/v1/meet/plans/plan-1`,
        expect.anything()
      );
    }
  );

  it('uses the default for Mail helpers without selecting their configured origin', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal(APP_BASE_GLOBAL, '/mail');
    vi.stubEnv('MAIL_APP_URL', 'https://mail.example.com');
    const fetch = mockFetch();
    register(appPath);
    await listMailMessages('ws-1', 'mailbox-1');
    expect(fetch).toHaveBeenCalledWith(
      '/mail/api/v1/workspaces/ws-1/mail/mailboxes/mailbox-1/messages',
      expect.anything()
    );

    for (const withBase of [
      withTaskApiBaseUrl,
      withMailApiBaseUrl,
      withLearnApiBaseUrl,
      withTeachApiBaseUrl,
      withPayApiBaseUrl,
      withContactsApiBaseUrl,
      withEducationBootstrapBaseUrl,
      withFinanceApiBaseUrl,
    ]) {
      expect(withBase()).toEqual({});
    }
  });

  it('keeps two interleaved requests isolated with one registration and one client', async () => {
    registerServerResolver();
    const fetch = mockFetch();
    const meetStarted = Promise.withResolvers<void>();
    const mailFinished = Promise.withResolvers<void>();
    const client = createInternalApiClient();

    await Promise.all([
      withBridgeRequest(
        {
          request: new Request('https://meet.example.com/page'),
          appBase: '/meet',
        },
        async () => {
          await client.fetch('/api/probe?step=before');
          meetStarted.resolve();
          await mailFinished.promise;
          await client.fetch('/api/probe?step=after');
        }
      ),
      withBridgeRequest(
        {
          request: new Request('https://mail.example.com/page'),
          appBase: '/mail',
        },
        async () => {
          await meetStarted.promise;
          try {
            await listMailMessages('ws-1', 'mailbox-1');
          } finally {
            mailFinished.resolve();
          }
        }
      ),
    ]);

    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      'https://meet.example.com/meet/api/probe?step=before',
      'https://mail.example.com/mail/api/v1/workspaces/ws-1/mail/mailboxes/mailbox-1/messages',
      'https://meet.example.com/meet/api/probe?step=after',
    ]);
    expect(() => resolveInternalApiUrl('/api/probe')).toThrow(
      'Start bridge request context unavailable'
    );
  });

  it('lets per-client resolvers override the registered default', async () => {
    vi.stubGlobal('window', {});
    const defaultResolver = vi.fn(() => '/mail/api/probe');
    register(defaultResolver);
    const fetch = mockFetch();
    await createInternalApiClient({
      appBaseResolver: () => 'https://meet.example.com/meet/api/probe',
    }).fetch('/api/probe');
    expect(defaultResolver).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      'https://meet.example.com/meet/api/probe',
      expect.anything()
    );
  });

  it('unregisters idempotently and restores only still-active registrations', () => {
    vi.stubGlobal('window', {});
    const removeMeet = register((path) => `/meet${path}`);
    const removeMail = register((path) => `/mail${path}`);
    expect(resolveInternalApiUrl('/api/probe')).toBe('/mail/api/probe');
    removeMail();
    expect(resolveInternalApiUrl('/api/probe')).toBe('/meet/api/probe');
    const removeNewMail = register((path) => `/mail${path}`);
    removeMeet();
    removeMeet();
    expect(resolveInternalApiUrl('/api/probe')).toBe('/mail/api/probe');
    removeNewMail();
    removeMail();
    expect(resolveInternalApiUrl('/api/probe')).toBe('/api/probe');
    expect(withMailApiBaseUrl().baseUrl).toBeDefined();
  });

  it('bypasses the default for absolute inputs and preserves absolute resolver output', async () => {
    const resolver = vi.fn(() => 'https://incoming.example.com/meet/api/probe');
    register(resolver);
    const url = 'https://external.example.com/api/probe';
    expect(resolveInternalApiUrl(url)).toBe(url);
    const fetch = mockFetch();
    await internalApiClient.fetch(url);
    expect(resolver).not.toHaveBeenCalled();
    expect(fetch.mock.calls[0]?.[0]).toBe(url);
    expect(resolveInternalApiUrl('/api/probe', 'https://web.example.com')).toBe(
      'https://incoming.example.com/meet/api/probe'
    );
  });
});
