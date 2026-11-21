import { afterEach, describe, expect, it, vi } from 'vitest';
import { manifest } from './manifest';
import { withWebRest } from './web-rest.test-helper';
import { type CacheLike, createHandler, type Env } from './worker';

const ACCEPTANCE = 'web-accept.staging.tutur3u.com';
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
  PUBLIC_HOST: ACCEPTANCE,
  GATEWAY_ACCEPTANCE_HOST: ACCEPTANCE,
  ...withWebRest(),
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

describe('acceptance host without Vercel', () => {
  it('serves through the web-rest family with no bypass secret or header', async () => {
    const t = setup();
    const response = await t.call(`https://${ACCEPTANCE}/api/v1/test`, {
      headers: { [BYPASS]: 'client-value', [COOKIE]: 'true' },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('x-gateway-cache')).toBe('FAMILY');
    expect(t.sent).toHaveLength(1);
    expect(new URL(t.sent[0]?.url ?? '').host).toBe(ACCEPTANCE);
    expect(t.sent[0]?.headers.has(BYPASS)).toBe(false);
    expect(t.sent[0]?.headers.has(COOKIE)).toBe(false);
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
    const unbound: Env = { ...env, WEB_FAMILY_WEB_REST: undefined };
    const unavailable = await t.call(
      `https://${ACCEPTANCE}/dashboard`,
      undefined,
      unbound
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
