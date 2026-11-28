import { afterEach, describe, expect, it, vi } from 'vitest';
import { manifest } from './manifest';
import { handleSubdomainRedirect } from './subdomain-redirect';
import { withWebRest } from './web-rest.test-helper';
import { type CacheLike, createHandler, type Env } from './worker';

const emptyCache: CacheLike = {
  match: async () => undefined,
  put: async () => {},
};
const handler = () =>
  createHandler({ cache: () => emptyCache, now: () => 0, manifest });

/** The gateway entries of the AI Studio mount. */
const mountPaths = '/ai,/ai/*';

function aiEnv() {
  const fetch = vi.fn(async (_request: Request) => new Response('ai'));
  const env = {
    PUBLIC_HOST: 'tuturuuu.com',
    ...withWebRest(),
    GATEWAY_MOUNTED_PATHS: mountPaths,
    MOUNT_AI: { fetch },
  } as unknown as Env;
  return { env, fetch };
}

function stubWeb() {
  const web = vi.fn(async () => new Response('web'));
  vi.stubGlobal('fetch', web);
  return web;
}

afterEach(() => vi.unstubAllGlobals());

describe('AI Studio mount', () => {
  it.each([
    '/ai',
    '/ai/',
    '/ai/vi',
    '/ai/personal/playground',
    '/ai/verify-token',
    '/ai/api/v1/workspaces/personal/ai/playground',
    '/ai/v1/responses',
    '/ai/_serverFn/abc',
    '/ai/assets/app-abc.js',
    '/ai/api/build-info',
    // Not the shared-chat subtree.
    '/ai/chatsx',
    '/ai/personal/chats',
  ])('dispatches %s to AI Studio with its original URL', async (path) => {
    const { env, fetch } = aiEnv();
    const web = stubWeb();
    const url = `https://tuturuuu.com${path}?ref=a&ref=b`;
    const response = await handler()(new Request(url), env);

    expect(response.headers.get('x-gateway-cache')).toBe('MOUNT');
    expect(fetch.mock.calls[0]?.[0].url).toBe(url);
    expect(web).not.toHaveBeenCalled();
  });

  it('streams a key-authenticated public API mutation through', async () => {
    const { env, fetch } = aiEnv();
    stubWeb();
    fetch.mockResolvedValueOnce(
      new Response('data: fixture\n\n', {
        headers: { 'content-type': 'text/event-stream' },
      })
    );
    const response = await handler()(
      new Request('https://tuturuuu.com/ai/v1/responses', {
        method: 'POST',
        body: '{"stream":true}',
        headers: {
          authorization: 'Bearer ttr_ai_fixture',
          'content-type': 'application/json',
          'x-forwarded-host': 'evil.example',
        },
      }),
      env
    );

    expect(response.headers.get('content-type')).toBe('text/event-stream');
    expect(await response.text()).toBe('data: fixture\n\n');
    const forwarded = fetch.mock.calls[0]?.[0] as Request;
    expect(forwarded.method).toBe('POST');
    expect(forwarded.headers.get('authorization')).toBe(
      'Bearer ttr_ai_fixture'
    );
    expect(forwarded.headers.get('x-forwarded-host')).toBeNull();
    expect(await forwarded.text()).toBe('{"stream":true}');
  });

  it.each([
    // The AI product page, and Web's redirect for the Vietnamese short link.
    '/products/ai',
    '/vi/products/ai',
    '/vi/ai',
    '/en/ai',
    // Publicly shared chat pages stay on Web.
    '/ai/chats',
    '/ai/chats/00000000-0000-4000-8000-000000000001',
    '/vi/ai/chats/00000000-0000-4000-8000-000000000001',
    // Web APIs never mount, and lookalikes are not AI Studio.
    '/api/v1/ai/chats',
    '/api/v1/workspaces/personal/ai/credits',
    '/aix',
    '/ai-studio',
  ])('leaves %s with Web', async (path) => {
    const { env, fetch } = aiEnv();
    const web = stubWeb();
    const response = await handler()(
      new Request(`https://tuturuuu.com${path}`),
      env
    );

    expect(response.headers.get('x-gateway-cache')).not.toBe('MOUNT');
    expect(fetch).not.toHaveBeenCalled();
    expect(web).toHaveBeenCalled();
  });

  it('does not mount /ai on an unlisted host or when MOUNT_AI is unbound', async () => {
    const { env, fetch } = aiEnv();
    const web = stubWeb();

    const wrongHost = await handler()(
      new Request('https://other.tuturuuu.com/ai'),
      env
    );
    expect(wrongHost.headers.get('x-gateway-cache')).not.toBe('MOUNT');

    const { MOUNT_AI: _unbound, ...withoutBinding } = env as unknown as Record<
      string,
      unknown
    >;
    const unbound = await handler()(
      new Request('https://tuturuuu.com/ai'),
      withoutBinding as unknown as Env
    );
    expect(unbound.headers.get('x-gateway-cache')).not.toBe('MOUNT');
    expect(fetch).not.toHaveBeenCalled();
    expect(web).toHaveBeenCalledTimes(1);
  });
});

describe('AI Studio legacy-host redirect', () => {
  function redirectEnv() {
    const fetch = vi.fn(async (_request: Request) => new Response('app'));
    return {
      env: { SUBDOMAIN_REDIRECT_APPS: 'ai', APP_AI: { fetch } },
      fetch,
    };
  }
  const navigate = { headers: { 'sec-fetch-mode': 'navigate' } };

  it.each([
    ['/', 'https://tuturuuu.com/ai'],
    [
      '/en/personal/runs?run=a%2Fb&run=c',
      'https://tuturuuu.com/ai/personal/runs?run=a%2Fb&run=c',
    ],
    ['/vi/personal/usage', 'https://tuturuuu.com/ai/vi/personal/usage'],
    ['/v1-guide', 'https://tuturuuu.com/ai/v1-guide'],
  ])('moves the navigation %s to the mount', async (path, target) => {
    const { env, fetch } = redirectEnv();
    const response = await handleSubdomainRedirect(
      new Request(`https://ai.tuturuuu.com${path}`, navigate),
      env
    );

    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe(target);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['/v1/models', 'GET'],
    ['/en/v1/models', 'GET'],
    ['/vi/v1/models', 'GET'],
    ['/v1', 'GET'],
    ['/v1/responses', 'POST'],
    ['/v1/colab/responses', 'POST'],
    ['/api/build-info', 'GET'],
    ['/verify-token?token=fixture', 'GET'],
    ['/assets/app-abc.js', 'GET'],
    ['/personal', 'POST'],
  ])('keeps %s (%s) on the app Worker', async (path, method) => {
    const { env, fetch } = redirectEnv();
    // Even a client that looks like a browser navigation keeps the public API.
    const response = await handleSubdomainRedirect(
      new Request(`https://ai.tuturuuu.com${path}`, { ...navigate, method }),
      env
    );

    expect(await response.text()).toBe('app');
    expect(fetch).toHaveBeenCalledOnce();
  });
});
