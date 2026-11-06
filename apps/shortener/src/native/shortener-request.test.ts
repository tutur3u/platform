// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { ShortLinkPage } from '../link/resolve';
import type { LinkClickRecord, ShortLinkRecord } from '../link/store';
import {
  DYNAMIC_CACHE_CONTROL,
  PUBLIC_FILES,
  type ShortenerEnvironment,
  shortenerRequest,
} from './shortener-request';

const rows: ShortLinkRecord[] = [
  {
    id: 'l1',
    link: 'https://example.com/landing?utm=a&utm=b',
    password_hash: null,
    password_hint: null,
  },
  {
    id: 'l2',
    link: 'https://locked.example',
    password_hash: 'hash:pw',
    password_hint: 'hint',
  },
  { id: 'l3', link: 'nope', password_hash: null, password_hint: null },
];
const slugs: Record<string, string> = {
  abc123: 'l1',
  'My-Alias_1': 'l1',
  'a/b': 'l1',
  locked: 'l2',
  broken: 'l3',
};

function setup(env: Partial<ShortenerEnvironment> = {}) {
  const clicks: LinkClickRecord[] = [];
  const pages: (ShortLinkPage | null)[] = [];
  const forwarded: { url: string; origin: string; search: string }[] = [];
  const assets: string[] = [];
  let guard: Response | null = null;
  const deps = {
    store: () => ({
      findBySlug: async (slug: string) =>
        rows.find((row) => row.id === slugs[slug]) ?? null,
      findById: async (id: string) => rows.find((row) => row.id === id) ?? null,
      recordClick: async (record: LinkClickRecord) => {
        clicks.push(record);
      },
    }),
    buildInfo: (request: Request) =>
      new URL(request.url).pathname === '/api/build-info'
        ? Response.json({ appName: 'shortener' })
        : null,
    guard: vi.fn(async () => guard),
    forwardApi: vi.fn(
      async (request: Request, origin: string, search: string) => {
        forwarded.push({ url: request.url, origin, search });
        return Response.json({ ok: true });
      }
    ),
    comparePassword: async (password: string, hash: string) =>
      `hash:${password}` === hash,
    renderPage: vi.fn(async (_request: Request, page: ShortLinkPage | null) => {
      pages.push(page);
      return new Response('<html>page</html>', {
        status: page ? 200 : 404,
        headers: { 'Content-Type': 'text/html' },
      });
    }),
  };
  const environment: ShortenerEnvironment = {
    ASSETS: {
      fetch: async (input) => {
        assets.push(new URL(input).pathname);
        return new Response('asset');
      },
    },
    INTERNAL_WEB_API_ORIGIN: 'https://central.example',
    ...env,
  };
  const call = (input: string, init?: RequestInit) =>
    shortenerRequest(new Request(input, init), environment, deps);
  return {
    call,
    clicks,
    pages,
    forwarded,
    assets,
    deps,
    deny: (response: Response) => {
      guard = response;
    },
  };
}
const origin = 'https://tuturuuu-shortener-vite-staging.example.workers.dev';

describe('canonical host fence and domain aliases', () => {
  it('holds all seven production hosts until canonical serving is enabled', async () => {
    const { call, clicks } = setup();
    for (const host of [
      'ttr.gg',
      'www.ttr.gg',
      'shortener.tuturuuu.com',
      'tuturuu.com',
      'www.tuturuu.com',
      'tutur3u.com',
      'www.tutur3u.com',
    ]) {
      const response = await call(`https://${host}/abc123`);
      expect(response.status).toBe(503);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
    }
    expect(clicks).toEqual([]);
  });

  it('redirects aliases to ttr.gg with path and raw duplicate query', async () => {
    const { call, clicks } = setup({ SHORTENER_CANONICAL_HOST_ENABLED: '1' });
    const alias = await call('https://www.ttr.gg/abc123?a=1&a=2&b=%20');
    expect(alias.status).toBe(308);
    expect(alias.headers.get('location')).toBe(
      'https://ttr.gg/abc123?a=1&a=2&b=%20'
    );
    const legacy = await call('https://shortener.tuturuuu.com/x?a=2&a=1');
    expect(legacy.status).toBe(307);
    expect(legacy.headers.get('location')).toBe('https://ttr.gg/x?a=2&a=1');
    expect(clicks).toEqual([]);
    const canonical = await call('https://ttr.gg/abc123');
    expect(canonical.status).toBe(307);
    expect(clicks).toHaveLength(1);
  });
});

describe('short-link documents', () => {
  it('redirects with 307 to the exact stored target and records one click', async () => {
    const { call, clicks } = setup();
    for (const slug of ['abc123', 'My-Alias_1', 'a%2Fb']) {
      const response = await call(`${origin}/${slug}?ref=x&ref=y`, {
        headers: { 'cf-connecting-ip': '198.51.100.1', 'user-agent': 'UA' },
      });
      expect(response.status).toBe(307);
      // The legacy page redirected to the stored link without the short query.
      expect(response.headers.get('location')).toBe(
        'https://example.com/landing?utm=a&utm=b'
      );
      expect(response.headers.get('cache-control')).toBe(DYNAMIC_CACHE_CONTROL);
      expect(response.headers.get('x-robots-tag')).toBe(
        'noindex, nofollow, nosnippet'
      );
      expect(response.headers.get('x-frame-options')).toBe('DENY');
      expect(response.headers.get('content-security-policy')).toBe(
        "frame-ancestors 'none'"
      );
    }
    expect(clicks.map((click) => click.link_id)).toEqual(['l1', 'l1', 'l1']);
    expect(clicks[0]).toMatchObject({ user_agent: 'UA' });
  });

  it('looks up the exact case-sensitive slug and does not let analytics failure block redirect', async () => {
    const fixture = setup();
    const findBySlug = vi.fn(
      async (slug: string) => rows.find((row) => row.id === slugs[slug]) ?? null
    );
    const recordClick = vi.fn(async () => {
      throw new Error('analytics unavailable');
    });
    fixture.deps.store = () => ({
      findBySlug,
      findById: async (id: string) => rows.find((row) => row.id === id) ?? null,
      recordClick,
    });
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = await fixture.call(`${origin}/My-Alias_1`);
    expect(findBySlug).toHaveBeenCalledExactlyOnceWith('My-Alias_1');
    expect(recordClick).toHaveBeenCalledOnce();
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://example.com/landing?utm=a&utm=b'
    );
    expect(logError).toHaveBeenCalled();
    logError.mockRestore();
  });

  it('renders not-found, invalid and password pages through Start', async () => {
    const { call, clicks, pages } = setup();
    for (const slug of ['missing', 'broken', 'locked', 'my-alias_1'])
      expect((await call(`${origin}/${slug}`)).status).toBe(200);
    expect(pages).toEqual([
      { kind: 'not-found' },
      { kind: 'invalid' },
      { kind: 'password', linkId: 'l2', slug: 'locked', hint: 'hint' },
      { kind: 'not-found' },
    ]);
    expect(clicks).toEqual([]);
  });

  it('keeps root, trailing slash, nested, malformed and method behavior', async () => {
    const { call, pages, deps } = setup();
    const root = await call(`${origin}/?a=1`);
    expect(root.status).toBe(307);
    expect(root.headers.get('location')).toBe('https://tuturuuu.com');
    const slash = await call(`${origin}/abc123/?a=1&a=2`);
    expect(slash.status).toBe(308);
    expect(slash.headers.get('location')).toBe('/abc123?a=1&a=2');
    expect((await call(`${origin}/a/b`)).status).toBe(404);
    expect(pages).toEqual([null]);
    expect((await call(`${origin}/%ZZ`)).status).toBe(400);
    const post = await call(`${origin}/abc123`, { method: 'POST' });
    expect(post.status).toBe(405);
    expect(post.headers.get('allow')).toBe('GET, HEAD');
    const head = await call(`${origin}/abc123`, { method: 'HEAD' });
    expect(head.status).toBe(307);
    expect(head.body).toBeNull();
    expect(deps.renderPage).toHaveBeenCalledTimes(1);
    const page = await call(`${origin}/missing`, { method: 'HEAD' });
    expect(page.status).toBe(200);
    expect(page.body).toBeNull();
    expect(deps.renderPage.mock.calls.at(-1)?.[0].method).toBe('GET');
  });

  it('serves owned static files before any slug lookup', async () => {
    const { call, assets, clicks } = setup();
    for (const path of [...PUBLIC_FILES, '/assets/main-abc.js'])
      expect((await call(`${origin}${path}`)).status).toBe(200);
    expect(assets).toEqual([...PUBLIC_FILES, '/assets/main-abc.js']);
    expect(clicks).toEqual([]);
  });

  it('dispatches Start server functions without a resolved page', async () => {
    const { call, pages } = setup();
    await call(`${origin}/_serverFn/abc`);
    expect(pages).toEqual([null]);
  });
});

describe('API ownership and abuse guard', () => {
  it('serves build identity locally', async () => {
    const { call, deps } = setup();
    const response = await call(`${origin}/api/build-info`);
    expect(await response.json()).toEqual({ appName: 'shortener' });
    expect(deps.guard).not.toHaveBeenCalled();
  });

  it('guards every other API path before any owner runs', async () => {
    const { call, deny, forwarded, clicks } = setup();
    deny(new Response('limited', { status: 429 }));
    for (const path of ['/api/verify', '/api/v1/x?a=1', '/api'])
      expect(
        (await call(`${origin}${path}`, { method: 'POST', body: '{}' })).status
      ).toBe(429);
    expect(forwarded).toEqual([]);
    expect(clicks).toEqual([]);
  });

  it('owns password verification locally', async () => {
    const { call, clicks } = setup();
    const verify = (password: string) =>
      call(`${origin}/api/verify`, {
        method: 'POST',
        body: JSON.stringify({ linkId: 'l2', slug: 'locked', password }),
      });
    expect((await verify('wrong')).status).toBe(403);
    const ok = await verify('pw');
    expect(await ok.json()).toEqual({
      url: 'https://locked.example',
      success: true,
    });
    expect(clicks.map((click) => click.link_id)).toEqual(['l2']);
    expect((await call(`${origin}/api/verify`)).status).toBe(405);
    expect(
      (await call(`${origin}/api/verify`, { method: 'OPTIONS' })).status
    ).toBe(204);
  });

  it('forwards unowned API paths to central with the raw query', async () => {
    const { call, forwarded } = setup();
    const response = await call(`${origin}/api/v1/links?tag=1&tag=2&x=%20`);
    expect(response.status).toBe(200);
    expect(forwarded).toEqual([
      {
        url: `${origin}/api/v1/links?tag=1&tag=2&x=%20`,
        origin: 'https://central.example',
        search: '?tag=1&tag=2&x=%20',
      },
    ]);
  });
});
