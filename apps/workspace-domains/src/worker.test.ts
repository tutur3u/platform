import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONTENT_SECURITY_POLICY } from './html';
import {
  type CacheLike,
  EDGE_SECRET_HEADER,
  EDGE_USER_AGENT,
  type Env,
} from './resolve';
import { createHandler } from './worker';

class MemoryCache implements CacheLike {
  entries = new Map<string, Response>();
  async match(request: Request) {
    return this.entries.get(request.url)?.clone();
  }
  async put(request: Request, response: Response) {
    this.entries.set(request.url, response);
  }
}

const WS_ID = '00000000-0000-4000-8000-000000000001';
const STATIC_MAP = JSON.stringify({
  'vohoangphuc.com': { wsId: WS_ID, name: 'Phuc <Studio>' },
});

type Origin = (request: Request) => Response | Promise<Response>;

function setup(origin: Origin = () => new Response(null, { status: 404 })) {
  const cache = new MemoryCache();
  const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) =>
    origin(new Request(input, init))
  );
  vi.stubGlobal('fetch', fetchMock);
  const pending: Promise<unknown>[] = [];
  const handle = createHandler({ cache: () => cache });
  return {
    cache,
    fetchMock,
    call: async (
      url: string,
      env: Env = { STATIC_HOST_MAP: STATIC_MAP },
      init?: RequestInit
    ) => {
      const response = await handle(new Request(url, init), env, {
        waitUntil: (promise) => pending.push(promise),
      });
      await Promise.all(pending);
      return response;
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

function expectHygiene(response: Response) {
  expect(response.headers.get('content-security-policy')).toBe(
    CONTENT_SECURITY_POLICY
  );
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  expect(response.headers.get('referrer-policy')).toBe(
    'strict-origin-when-cross-origin'
  );
  expect(response.headers.get('strict-transport-security')).toContain(
    'max-age='
  );
  expect(response.headers.has('set-cookie')).toBe(false);
}

describe('workspace domains worker', () => {
  it('answers health checks without resolving the host', async () => {
    const t = setup();
    const response = await t.call('https://unknown.example/__health');
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');
    expect(t.fetchMock).not.toHaveBeenCalled();
  });

  it('rejects non GET/HEAD methods', async () => {
    const t = setup();
    const response = await t.call('https://vohoangphuc.com/', undefined, {
      method: 'POST',
      body: 'x',
    });
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET, HEAD');
    expectHygiene(response);
  });

  it('returns 404 for unknown hosts', async () => {
    const t = setup();
    const response = await t.call('https://unknown.example/');
    expect(response.status).toBe(404);
    expectHygiene(response);
  });

  it('returns 404 for unusable host headers', async () => {
    const t = setup();
    const response = await t.call('https://vohoangphuc.com/', undefined, {
      headers: { host: '[::1]:8787' },
    });
    expect(response.status).toBe(404);
  });

  it('serves the landing page from the static map with escaped name', async () => {
    const t = setup();
    const response = await t.call('https://VoHoangPhuc.com:443/');
    expect(response.status).toBe(200);
    expectHygiene(response);
    const html = await response.text();
    expect(html).toContain('Phuc &lt;Studio&gt;');
    expect(html).not.toContain('<Studio>');
    expect(html).toContain('Powered by');
    expect(html).not.toContain('<script');
    // Bootstrap without a secret: no origin calls at all.
    expect(t.fetchMock).not.toHaveBeenCalled();
  });

  it('serves robots.txt for known hosts', async () => {
    const t = setup();
    const response = await t.call('https://vohoangphuc.com/robots.txt');
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('User-agent: *');
  });

  it('uses the resolver with the edge secret and caches its answer', async () => {
    const t = setup((request) => {
      if (request.url.includes('/workspace-domains/resolve')) {
        expect(request.headers.get(EDGE_SECRET_HEADER)).toBe('s3cret');
        expect(request.headers.get('user-agent')).toBe(EDGE_USER_AGENT);
        return Response.json({
          wsId: WS_ID,
          name: 'Resolved',
          avatarUrl: 'javascript:alert(1)',
          siteAvailable: false,
        });
      }
      throw new Error(`unexpected fetch ${request.url}`);
    });
    const env = { WORKSPACE_DOMAINS_EDGE_SECRET: 's3cret' };
    const first = await t.call('https://site.example/', env);
    expect(await first.text()).toContain('Resolved');
    const second = await t.call('https://site.example/', env);
    expect(second.status).toBe(200);
    expect(t.fetchMock).toHaveBeenCalledTimes(1);
    expect(await second.text()).not.toContain('javascript:');
  });

  it('treats a resolver 404 as authoritative over the static map', async () => {
    const t = setup(() => new Response(null, { status: 404 }));
    const env = {
      STATIC_HOST_MAP: STATIC_MAP,
      WORKSPACE_DOMAINS_EDGE_SECRET: 's3cret',
    };
    const response = await t.call('https://vohoangphuc.com/', env);
    expect(response.status).toBe(404);
    // The negative answer is cached too.
    expect((await t.call('https://vohoangphuc.com/', env)).status).toBe(404);
    expect(t.fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses the static map only while the resolver is unconfigured', async () => {
    const t = setup();
    const response = await t.call('https://vohoangphuc.com/', {
      STATIC_HOST_MAP: STATIC_MAP,
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Phuc &lt;Studio&gt;');
    expect(t.fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to the static map with a warning when the resolver fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const t = setup(() => new Response('upstream', { status: 503 }));
    const env = {
      STATIC_HOST_MAP: STATIC_MAP,
      WORKSPACE_DOMAINS_EDGE_SECRET: 's3cret',
    };
    const known = await t.call('https://vohoangphuc.com/', env);
    expect(known.status).toBe(200);
    expect(await known.text()).toContain('Phuc &lt;Studio&gt;');
    expect(warn).toHaveBeenCalledWith(
      'workspace-domains: resolver unavailable',
      { host: 'vohoangphuc.com', staticFallback: true }
    );
    // Failures are not cached and unknown hosts still 404.
    expect((await t.call('https://other.example/', env)).status).toBe(404);
    expect(t.fetchMock).toHaveBeenCalledTimes(2);

    const offline = setup(() => {
      throw new TypeError('network down');
    });
    expect((await offline.call('https://vohoangphuc.com/', env)).status).toBe(
      200
    );
  });

  it('ignores an invalid static map', async () => {
    const t = setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await t.call('https://vohoangphuc.com/', {
      STATIC_HOST_MAP: '{not json',
    });
    expect(response.status).toBe(404);
  });

  it('server-renders published content from the edge site endpoint', async () => {
    const payload = {
      collections: [
        {
          id: 'c1',
          slug: 'pages',
          title: 'Pages',
          entries: [
            {
              id: 'e1',
              slug: 'home',
              title: 'Welcome',
              assets: [],
              blocks: [
                {
                  id: 'b1',
                  block_type: 'markdown',
                  sort_order: 0,
                  content: { markdown: 'Hello <b>world</b>' },
                },
              ],
            },
          ],
        },
      ],
    };
    const env = { WORKSPACE_DOMAINS_EDGE_SECRET: 's3cret' };
    const t = setup((request) => {
      expect(request.headers.get(EDGE_SECRET_HEADER)).toBe('s3cret');
      if (request.url.includes('/workspace-domains/resolve')) {
        return Response.json({
          wsId: WS_ID,
          name: 'Phuc',
          avatarUrl: null,
          siteAvailable: true,
        });
      }
      expect(request.url).toBe(
        'https://tuturuuu.com/api/v1/workspace-domains/site?host=vohoangphuc.com'
      );
      return Response.json(payload);
    });
    const response = await t.call('https://vohoangphuc.com/', env);
    expect(response.status).toBe(200);
    expectHygiene(response);
    const html = await response.text();
    expect(html).toContain('<h1>Welcome</h1>');
    expect(html).toContain('Hello &lt;b&gt;world&lt;/b&gt;');
    expect(html).not.toContain('<script');

    const missing = await t.call('https://vohoangphuc.com/nope', env);
    expect(missing.status).toBe(404);
    // Resolve and site answers are cached for the second request.
    expect(t.fetchMock).toHaveBeenCalledTimes(2);
  });

  it('answers HEAD without a body', async () => {
    const t = setup();
    const response = await t.call('https://vohoangphuc.com/', undefined, {
      method: 'HEAD',
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
  });
});

describe('site endpoint failures', () => {
  it('falls back to the landing page when the site endpoint fails', async () => {
    const t = setup((request) =>
      request.url.includes('/resolve')
        ? Response.json({
            wsId: WS_ID,
            name: 'Phuc',
            avatarUrl: null,
            siteAvailable: true,
          })
        : new Response(null, { status: 500 })
    );
    const response = await t.call('https://vohoangphuc.com/', {
      WORKSPACE_DOMAINS_EDGE_SECRET: 's3cret',
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Powered by');
  });
});
