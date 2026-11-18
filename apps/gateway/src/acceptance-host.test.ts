import { afterEach, describe, expect, it, vi } from 'vitest';
import { FRESH_SECONDS } from './cache-rules';
import { manifest } from './manifest';
import { type CacheLike, createHandler, type Env } from './worker';

const ACCEPTANCE = 'web-accept.staging.tutur3u.com';
const SECRET = 'bypass-secret-value-0123456789';
const BYPASS = 'x-vercel-protection-bypass';
const COOKIE = 'x-vercel-set-bypass-cookie';

class MemoryCache implements CacheLike {
  entries = new Map<string, Response>();
  async match(request: Request) {
    return this.entries.get(request.url)?.clone();
  }
  async put(request: Request, response: Response) {
    this.entries.set(request.url, response);
  }
}

const ENV: Env = {
  WEB_ORIGIN: 'https://staging-web.vercel.app',
  PUBLIC_HOST: ACCEPTANCE,
  GATEWAY_ACCEPTANCE_HOST: ACCEPTANCE,
  VERCEL_PROTECTION_BYPASS: SECRET,
};

function setup(
  origin: (request: Request) => Response = () => new Response('ok')
) {
  const cache = new MemoryCache();
  let now = 1_000_000;
  const sent: Request[] = [];
  vi.stubGlobal('fetch', async (input: Request) => {
    sent.push(input);
    return origin(input);
  });
  const handle = createHandler({
    cache: () => cache,
    now: () => now,
    manifest,
  });
  return {
    sent,
    advance: (seconds: number) => {
      now += seconds * 1000;
    },
    call: (url: string, init?: RequestInit, env: Env = ENV) =>
      handle(new Request(url, init), env),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('acceptance host protection bypass', () => {
  it('sends the bypass header to the staging web origin only', async () => {
    const t = setup();
    for (const path of ['/about', '/api/v1/test', '/dashboard']) {
      const response = await t.call(`https://${ACCEPTANCE}${path}`);
      expect(response.status).toBe(200);
    }
    expect(t.sent).toHaveLength(3);
    for (const request of t.sent) {
      expect(new URL(request.url).host).toBe('staging-web.vercel.app');
      expect(request.headers.get(BYPASS)).toBe(SECRET);
      expect(request.headers.has(COOKIE)).toBe(false);
    }
  });

  it('carries the bypass on HEAD and on stale revalidation', async () => {
    const t = setup();
    await t.call(`https://${ACCEPTANCE}/about`);
    await t.call(`https://${ACCEPTANCE}/pricing`, { method: 'HEAD' });
    t.advance(FRESH_SECONDS + 1);
    const stale = await t.call(`https://${ACCEPTANCE}/about`);
    expect(stale.headers.get('x-gateway-cache')).toBe('STALE');
    expect(t.sent).toHaveLength(3);
    expect(t.sent.map((request) => request.method)).toContain('HEAD');
    for (const request of t.sent) {
      expect(request.headers.get(BYPASS)).toBe(SECRET);
    }
  });

  it('replaces client-supplied bypass headers with the Worker secret', async () => {
    const t = setup();
    await t.call(`https://${ACCEPTANCE}/api/v1/test`, {
      headers: { [BYPASS]: 'client-value', [COOKIE]: 'true' },
    });
    expect(t.sent[0]?.headers.get(BYPASS)).toBe(SECRET);
    expect(t.sent[0]?.headers.has(COOKIE)).toBe(false);
  });

  it('never sends the bypass on production tuturuuu.com', async () => {
    const t = setup();
    const production: Env = { ...ENV, PUBLIC_HOST: 'tuturuuu.com' };
    for (const path of ['/about', '/api/v1/test']) {
      await t.call(
        `https://tuturuuu.com${path}`,
        { headers: { [BYPASS]: 'client-value', [COOKIE]: 'true' } },
        production
      );
    }
    expect(t.sent).toHaveLength(2);
    for (const request of t.sent) {
      expect(request.headers.has(BYPASS)).toBe(false);
      expect(request.headers.has(COOKIE)).toBe(false);
    }
  });

  it('sends nothing when no acceptance host is configured', async () => {
    const t = setup();
    const noHost: Env = { ...ENV, GATEWAY_ACCEPTANCE_HOST: undefined };
    await t.call(`https://${ACCEPTANCE}/about`, undefined, noHost);
    expect(t.sent[0]?.headers.has(BYPASS)).toBe(false);
  });

  it('does not send the bypass to the Marketing origin', async () => {
    const t = setup();
    const marketing: Env = {
      ...ENV,
      MARKETING_ORIGIN: 'https://marketing.staging.example',
      GATEWAY_MARKETING_GROUPS: 'home,legal,company,products,solutions,blog',
    };
    await t.call(`https://${ACCEPTANCE}/about`, undefined, marketing);
    expect(new URL(t.sent[0]?.url ?? '').host).toBe(
      'marketing.staging.example'
    );
    expect(t.sent[0]?.headers.has(BYPASS)).toBe(false);
  });

  it('never reflects the secret in a response', async () => {
    const t = setup(
      () =>
        new Response('body', {
          headers: {
            [BYPASS]: SECRET,
            [COOKIE]: 'true',
            'x-echo': `seen ${SECRET}`,
            'x-keep': 'kept',
          },
        })
    );
    for (const path of ['/about', '/api/v1/test']) {
      const response = await t.call(`https://${ACCEPTANCE}${path}`);
      expect(response.headers.has(BYPASS)).toBe(false);
      expect(response.headers.has(COOKIE)).toBe(false);
      expect(response.headers.has('x-echo')).toBe(false);
      expect(response.headers.get('x-keep')).toBe('kept');
      expect(await response.text()).toBe('body');
    }
    const cached = await t.call(`https://${ACCEPTANCE}/about`);
    expect(cached.headers.get('x-gateway-cache')).toBe('HIT');
    expect(
      [...cached.headers.values()].some((value) => value.includes(SECRET))
    ).toBe(false);
  });

  it.each([undefined, '', '   '])(
    'answers 503 with no detail when the secret is %j',
    async (value) => {
      const t = setup();
      const response = await t.call(`https://${ACCEPTANCE}/about`, undefined, {
        ...ENV,
        VERCEL_PROTECTION_BYPASS: value,
      });
      expect(response.status).toBe(503);
      expect(await response.text()).toBe('');
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(t.sent).toHaveLength(0);
    }
  );

  it('leaves production unaffected when the secret is absent', async () => {
    const t = setup();
    const production: Env = {
      WEB_ORIGIN: 'https://web-origin.vercel.app',
      PUBLIC_HOST: 'tuturuuu.com',
    };
    const response = await t.call(
      'https://tuturuuu.com/about',
      undefined,
      production
    );
    expect(response.status).toBe(200);
    expect(t.sent[0]?.headers.has(BYPASS)).toBe(false);
  });
});

const NOINDEX = 'noindex, nofollow, nosnippet';
const MARKETING_ENV: Env = {
  MARKETING_ORIGIN: 'https://marketing.staging.example',
  GATEWAY_MARKETING_GROUPS: 'home,legal,company,products,solutions,blog',
};

describe('acceptance host search-engine exclusion', () => {
  it('serves a disallow-all robots.txt without reaching an origin', async () => {
    const t = setup();
    const response = await t.call(`https://${ACCEPTANCE}/robots.txt`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(await response.text()).toBe('User-agent: *\nDisallow: /\n');
    expect(response.headers.get('x-robots-tag')).toBe(NOINDEX);
    expect(t.sent).toHaveLength(0);
  });

  it('answers HEAD /robots.txt with no body and leaves other methods alone', async () => {
    const t = setup();
    const head = await t.call(`https://${ACCEPTANCE}/robots.txt`, {
      method: 'HEAD',
    });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');
    expect(t.sent).toHaveLength(0);
    await t.call(`https://${ACCEPTANCE}/robots.txt`, { method: 'POST' });
    expect(t.sent).toHaveLength(1);
  });

  it('serves robots.txt even while the bypass secret is missing', async () => {
    const t = setup();
    const noSecret: Env = { ...ENV, VERCEL_PROTECTION_BYPASS: undefined };
    const response = await t.call(
      `https://${ACCEPTANCE}/robots.txt`,
      undefined,
      noSecret
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('User-agent: *\nDisallow: /\n');
  });

  it.each([
    '/about',
    '/api/v1/test',
    '/dashboard',
    '/some/unknown/page',
    '/robots.txt/extra',
  ])('marks every response on %s noindex', async (path) => {
    const t = setup();
    const first = await t.call(`https://${ACCEPTANCE}${path}`);
    expect(first.headers.get('x-robots-tag')).toBe(NOINDEX);
    const second = await t.call(`https://${ACCEPTANCE}${path}`);
    expect(second.headers.get('x-robots-tag')).toBe(NOINDEX);
  });

  it('marks cached marketing pages and the 503 noindex', async () => {
    const t = setup();
    const env: Env = { ...ENV, ...MARKETING_ENV };
    const miss = await t.call(`https://${ACCEPTANCE}/about`, undefined, env);
    const hit = await t.call(`https://${ACCEPTANCE}/about`, undefined, env);
    expect(miss.headers.get('x-robots-tag')).toBe(NOINDEX);
    expect(hit.headers.get('x-gateway-cache')).toBe('HIT');
    expect(hit.headers.get('x-robots-tag')).toBe(NOINDEX);
    const noSecret: Env = { ...env, VERCEL_PROTECTION_BYPASS: undefined };
    const unavailable = await t.call(
      `https://${ACCEPTANCE}/about`,
      undefined,
      noSecret
    );
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get('x-robots-tag')).toBe(NOINDEX);
  });

  it('leaves production tuturuuu.com robots.txt and marketing pages unaffected', async () => {
    const t = setup((request) =>
      new URL(request.url).pathname === '/robots.txt'
        ? new Response('User-agent: *\nAllow: /\n')
        : new Response('page')
    );
    const production: Env = {
      ...ENV,
      ...MARKETING_ENV,
      PUBLIC_HOST: 'tuturuuu.com',
    };
    const robots = await t.call(
      'https://tuturuuu.com/robots.txt',
      undefined,
      production
    );
    expect(await robots.text()).toBe('User-agent: *\nAllow: /\n');
    expect(t.sent).toHaveLength(1);
    const page = await t.call(
      'https://tuturuuu.com/about',
      undefined,
      production
    );
    expect(page.headers.has('x-robots-tag')).toBe(false);
    const acceptancePage = await t.call(
      `https://${ACCEPTANCE}/about`,
      undefined,
      { ...production, PUBLIC_HOST: ACCEPTANCE }
    );
    expect(acceptancePage.headers.get('x-robots-tag')).toBe(NOINDEX);
  });

  it('applies nothing when no acceptance host is configured', async () => {
    const t = setup();
    const noHost: Env = { ...ENV, GATEWAY_ACCEPTANCE_HOST: undefined };
    const response = await t.call(
      `https://${ACCEPTANCE}/robots.txt`,
      undefined,
      noHost
    );
    expect(await response.text()).toBe('ok');
    expect(t.sent).toHaveLength(1);
  });
});
