import { afterEach, describe, expect, it, vi } from 'vitest';
import marketing from '../../marketing/start-bridge.config';
import policies from '../../../packages/utils/src/seo-policy.json';
import { PRIVATE_ROBOTS_HEADER } from '../../../packages/utils/src/seo-robots';
import { manifest } from './manifest';
import { applyMarketingRobots } from './marketing-robots';
import { createHandler, type Env } from './worker';

const env: Env = {
  WEB_ORIGIN: 'https://web.example',
  MARKETING_ORIGIN: 'https://marketing.tuturuuu.com',
  PUBLIC_HOST: 'tuturuuu.com',
  GATEWAY_MARKETING_GROUPS: 'home,legal,company,products,solutions,blog',
};
function setup(
  options: {
    backendNoindex?: string;
    unmarked?: boolean;
    headers?: Record<string, string>;
    status?: number;
  } = {}
) {
  let now = 1000;
  const entries = new Map<string, Response>();
  const sent: Request[] = [];
  const handle = createHandler({
    manifest,
    now: () => now,
    cache: () => ({
      match: async (key) => entries.get(key.url)?.clone(),
      put: async (key, value) => {
        entries.set(key.url, value);
      },
    }),
  });
  vi.stubGlobal('fetch', async (request: Request) => {
    sent.push(request);
    const response = new Response('unchanged body', {
      status: options.status ?? 200,
      headers: options.headers,
    });
    if (new URL(request.url).hostname !== 'marketing.tuturuuu.com')
      return response;
    const secured = await marketing.wrapResponse!(response, {
      request,
      env: { TUTURUUU_NOINDEX: options.backendNoindex },
      seoPolicy: policies.marketing,
    });
    if (options.unmarked) secured.headers.delete('x-marketing-origin-robots');
    return secured;
  });
  return {
    sent,
    advance: () => {
      now += 301_000;
    },
    call: (url: string, init?: RequestInit, settings = env) =>
      handle(new Request(url, init), settings),
  };
}
afterEach(() => vi.unstubAllGlobals());
describe('gateway → Marketing response policy', () => {
  it.each([
    '/',
    '/vi',
    '/vi/',
    '/pricing',
    '/vi/pricing',
    '/privacy',
    '/vi/terms',
    '/about',
    '/products/ai',
    '/solutions/education',
  ])(
    'evaluates %s against the incoming canonical URL on MISS, HIT and STALE',
    async (path) => {
      const t = setup();
      for (const state of ['MISS', 'HIT', 'STALE']) {
        const response = await t.call(
          `https://tuturuuu.com${path}?utm_source=test`
        );
        expect(response.headers.get('x-robots-tag')).toBeNull();
        expect(response.headers.get('x-marketing-origin-robots')).toBeNull();
        expect(response.headers.get('x-gateway-cache')).toBe(state);
        expect(await response.text()).toBe('unchanged body');
        if (state === 'HIT') t.advance();
      }
      expect(t.sent).toHaveLength(2);
      expect(t.sent[0]?.url).toBe(
        `https://marketing.tuturuuu.com${path}?utm_source=test`
      );
    }
  );
  it.each([
    'https://staging.tuturuuu.com/',
    'http://tuturuuu.com/',
    'https://tuturuuu.com.evil.test/',
    'https://tuturuuu.com./',
    'https://tuturuuu.com:444/',
    'https://evil.test/',
    'https://tuturuuu.com/login',
    'https://tuturuuu.com/dashboard',
    'https://tuturuuu.com/api/v1/test',
    'https://tuturuuu.com/tasks',
    'https://tuturuuu.com/unknown',
    'https://tuturuuu.com/pricing-extra',
    'https://tuturuuu.com/vi/about/extra',
    'https://tuturuuu.com/products/auth',
    'https://tuturuuu.com/products/%2Fai',
    'https://tuturuuu.com/%61uth',
    'https://tuturuuu.com/products/%ZZ',
    'https://tuturuuu.com/products/%2561i',
  ])('keeps %s private despite forged forwarding hints', async (url) => {
    const t = setup();
    const response = await t.call(url, {
      headers: {
        'x-forwarded-host': 'tuturuuu.com',
        'x-forwarded-proto': 'https',
        forwarded: 'host=tuturuuu.com;proto=https',
        'x-marketing-origin-robots': '1',
      },
    });
    expect(response.headers.get('x-robots-tag')).toContain('noindex');
  });
  it.each([
    ['1', 'noindex'],
    ['1', 'googlebot: noindex'],
    ['true', PRIVATE_ROBOTS_HEADER],
    ['', PRIVATE_ROBOTS_HEADER],
  ])(
    'preserves restrictions without exact provenance (%s, %s)',
    (marker, robots) => {
      const response = applyMarketingRobots(
        new Response('body', {
          headers: {
            'x-marketing-origin-robots': marker,
            'x-robots-tag': robots,
          },
        }),
        new Request('https://tuturuuu.com/'),
        true,
        false
      );
      expect(response.headers.get('x-robots-tag')).toBe(robots);
      expect(response.headers.has('x-marketing-origin-robots')).toBe(false);
    }
  );
  it('ignores forged private forwarding headers at public ingress', async () => {
    const t = setup();
    const response = await t.call('https://tuturuuu.com/', {
      headers: {
        'x-forwarded-host': 'marketing.tuturuuu.com',
        'x-forwarded-proto': 'http',
        forwarded: 'host=evil.test;proto=http',
        'x-marketing-origin-robots': '1',
      },
    });
    expect(response.headers.has('x-robots-tag')).toBe(false);
  });
  it('keeps old unmarked cached private responses private', async () => {
    const t = setup({ unmarked: true });
    for (const state of ['MISS', 'HIT', 'STALE']) {
      const response = await t.call('https://tuturuuu.com/');
      expect(response.headers.get('x-gateway-cache')).toBe(state);
      expect(response.headers.get('x-robots-tag')).toBe(PRIVATE_ROBOTS_HEADER);
      expect(response.headers.has('x-marketing-origin-robots')).toBe(false);
      if (state === 'HIT') t.advance();
    }
  });
  it('keeps every crawler off private routes with bot-specific upstream directives', async () => {
    const t = setup({
      headers: { 'x-robots-tag': 'googlebot: noindex, noarchive' },
    });
    const response = await t.call('https://tuturuuu.com/dashboard');
    expect(response.headers.get('x-robots-tag')).toBe(
      'noindex, nofollow, nosnippet, googlebot: noindex, noarchive'
    );
  });
  it('keeps explicit backend and gateway NOINDEX private, including a cache hit', async () => {
    const t = setup({ backendNoindex: '1' });
    expect(
      (await t.call('https://tuturuuu.com/')).headers.get('x-robots-tag')
    ).toContain('noindex');
    const cached = setup();
    await cached.call('https://tuturuuu.com/');
    const response = await cached.call('https://tuturuuu.com/', undefined, {
      ...env,
      TUTURUUU_NOINDEX: '1',
    });
    expect(response.headers.get('x-gateway-cache')).toBe('HIT');
    expect(response.headers.get('x-robots-tag')).toContain('noindex');
  });
  it.each([
    'noindex',
    'googlebot: noindex, noarchive',
    PRIVATE_ROBOTS_HEADER,
    'none',
  ])('preserves an intentional upstream directive %s', async (robots) => {
    const t = setup({ headers: { 'x-robots-tag': robots } });
    expect(
      (await t.call('https://tuturuuu.com/')).headers.get('x-robots-tag')
    ).toBe(robots);
  });
  it('preserves redirect, security, cache, Vary, authentication headers and body', async () => {
    const t = setup({
      status: 307,
      headers: {
        location: 'https://marketing.tuturuuu.com/#pricing',
        'content-security-policy': "default-src 'self'",
        vary: 'Accept-Language',
        'cache-control': 'private, no-store',
        'www-authenticate': 'Bearer',
        'set-cookie': 'opaque=1; Secure',
      },
    });
    const response = await t.call('https://tuturuuu.com/vi/pricing');
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'https://tuturuuu.com/#pricing'
    );
    expect(response.headers.get('x-robots-tag')).toBeNull();
    expect(response.headers.get('content-security-policy')).toContain(
      "default-src 'self'"
    );
    expect(response.headers.get('vary')).toBe('Accept-Language, Cookie');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('www-authenticate')).toBe('Bearer');
    expect(response.headers.get('set-cookie')).toBe('opaque=1; Secure');
    expect(await response.text()).toBe('unchanged body');
  });
  it.each([
    { headers: new Headers({ authorization: 'Bearer synthetic' }) },
    { headers: new Headers({ cookie: 'sb-test-auth-token=synthetic' }) },
    { headers: new Headers({ rsc: '1' }) },
  ])('keeps requests requiring Web private', async (init) => {
    const t = setup();
    const response = await t.call('https://tuturuuu.com/', init);
    expect(t.sent[0]?.url).toBe('https://web.example/');
    expect(response.headers.get('x-robots-tag')).toContain('noindex');
  });
});
