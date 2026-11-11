import { afterEach, describe, expect, it, vi } from 'vitest';
import marketing from '../../marketing/start-bridge.config';
import policies from '../../../packages/utils/src/seo-policy.json';
import { PRIVATE_ROBOTS_HEADER } from '../../../packages/utils/src/seo-robots';
import { manifest } from './manifest';
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
    headers?: Record<string, string>;
    status?: number;
  } = {}
) {
  const entries = new Map<string, Response>();
  const sent: Request[] = [];
  const handle = createHandler({
    manifest,
    now: () => 1000,
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
    return marketing.wrapResponse!(response, {
      request,
      env: { TUTURUUU_NOINDEX: options.backendNoindex },
      seoPolicy: policies.marketing,
    });
  });
  return {
    sent,
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
    'evaluates %s against the incoming canonical URL on MISS and HIT',
    async (path) => {
      const t = setup();
      for (const state of ['MISS', 'HIT']) {
        const response = await t.call(
          `https://tuturuuu.com${path}?utm_source=test`
        );
        expect(response.headers.get('x-robots-tag')).toBeNull();
        expect(response.headers.get('x-marketing-origin-robots')).toBeNull();
        expect(response.headers.get('x-gateway-cache')).toBe(state);
        expect(await response.text()).toBe('unchanged body');
      }
      expect(t.sent).toHaveLength(1);
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
