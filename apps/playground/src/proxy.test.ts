import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  guardApiProxyRequest: vi.fn(),
  hasSupabase: vi.fn(),
  hasWebSession: vi.fn(),
}));

vi.mock('@tuturuuu/auth/app-session', () => ({
  hasSupportedSupabaseAuthCookie: (...args: unknown[]) =>
    mocks.hasSupabase(...args),
  hasWebAppSessionTokenFromRequest: (...args: unknown[]) =>
    mocks.hasWebSession(...args),
}));
vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  guardApiProxyRequest: (...args: unknown[]) =>
    mocks.guardApiProxyRequest(...args),
}));

const { config, proxy } = await import('./proxy');

function request(
  path: string,
  init?: ConstructorParameters<typeof NextRequest>[1]
) {
  return new NextRequest(
    new URL(path, 'https://playground.contract.test'),
    init
  );
}

describe('playground proxy', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.guardApiProxyRequest.mockResolvedValue(null);
    mocks.hasSupabase.mockReturnValue(false);
    mocks.hasWebSession.mockReturnValue(false);
    vi.stubEnv('INTERNAL_WEB_API_ORIGIN', 'https://web.contract.test');
  });

  it.each(['/', '/tool-calling'])(
    'redirects signed-out %s to web sign-in',
    async (path) => {
      const res = await proxy(
        new NextRequest(`https://playground.test${path}`)
      );

      expect(res.status).toBe(307);
      expect(mocks.guardApiProxyRequest).not.toHaveBeenCalled();
      const location = new URL(res.headers.get('location') ?? '');
      expect(location.origin).toBe('https://web.contract.test');
      expect(location.pathname).toBe('/login');
      expect(location.searchParams.get('returnUrl')).toBe(
        `https://playground.test${path}`
      );
    }
  );

  it.each([
    ['supabase cookie', 'hasSupabase'],
    ['web app session', 'hasWebSession'],
  ] as const)('lets a %s through to the page', async (_n, key) => {
    mocks[key].mockReturnValue(true);

    const res = await proxy(new NextRequest('https://playground.test/'));

    expect(res.headers.get('location')).toBeNull();
    expect(res.status).toBe(200);
  });

  it('leaves /api to the route handlers after the rate-limit guard', async () => {
    const res = await proxy(
      new NextRequest('https://playground.test/api/ai/object-generation')
    );

    expect(mocks.guardApiProxyRequest).toHaveBeenCalledTimes(1);
    expect(res.headers.get('location')).toBeNull();
  });

  it('matches pages and api but not framework assets', () => {
    expect(config.matcher).toEqual(['/((?!_next|.*\\..*).*)']);
    const pattern = new RegExp(`^${config.matcher[0]}$`);
    expect(pattern.test('/')).toBe(true);
    expect(pattern.test('/tool-calling')).toBe(true);
    expect(pattern.test('/api/ai/tool-calling')).toBe(true);
    expect(pattern.test('/_next/static/chunk.js')).toBe(false);
    expect(pattern.test('/robots.txt')).toBe(false);
  });
  it('guards local and proxied API requests with the playground bucket prefix', async () => {
    mocks.guardApiProxyRequest.mockResolvedValue(null);

    for (const path of [
      '/api/ai/object-generation',
      '/api/build-info',
      '/api/v1/users/me',
    ]) {
      const req = request(path);
      const res = await proxy(req);

      expect(res.headers.get('x-middleware-next')).toBe('1');
      expect(mocks.guardApiProxyRequest).toHaveBeenLastCalledWith(req, {
        prefixBase: 'proxy:playground:api',
      });
    }
    expect(mocks.guardApiProxyRequest).toHaveBeenCalledTimes(3);
  });

  it('returns the guard rejection unchanged', async () => {
    const rejection = NextResponse.json(
      { error: 'Too Many Requests' },
      { status: 429 }
    );
    mocks.guardApiProxyRequest.mockResolvedValue(rejection);

    const res = await proxy(
      request('/api/ai/object-generation', { method: 'POST' })
    );

    expect(res).toBe(rejection);
    expect(res.status).toBe(429);
  });

  it('propagates guard failures instead of failing open', async () => {
    mocks.guardApiProxyRequest.mockRejectedValue(
      new Error('guard unavailable')
    );

    await expect(proxy(request('/api/build-info'))).rejects.toThrow(
      'guard unavailable'
    );
  });
});
