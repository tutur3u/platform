import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isCalendarApexMountUrl } from './lib/calendar-mount-hosts';
import { proxy } from './proxy';

const BASE = '/calendar';
const SUBDOMAIN = 'https://calendar.tuturuuu.com';
const APEX = 'https://tuturuuu.com';

const mocks = vi.hoisted(() => ({
  authProxy: vi.fn(),
  consumeVerifyTokenRequest: vi.fn(),
  refreshAppSessionForRequest: vi.fn(),
}));

vi.mock('@tuturuuu/auth/app-session', () => ({
  clearSupabaseAuthCookies: (_request: NextRequest, response: NextResponse) =>
    response,
  getAppSessionClaimsFromRequest: () => null,
  hasSupportedSupabaseAuthCookie: () => false,
  hasWebAppSessionTokenFromRequest: () => false,
}));

vi.mock('@tuturuuu/auth/proxy', async () => ({
  ...(await vi.importActual<typeof import('@tuturuuu/auth/proxy')>(
    '@tuturuuu/auth/proxy'
  )),
  consumeVerifyTokenRequest: (
    ...args: Parameters<typeof mocks.consumeVerifyTokenRequest>
  ) => mocks.consumeVerifyTokenRequest(...args),
  createCentralizedAuthProxy: () => mocks.authProxy,
  refreshAppSessionForRequest: (
    ...args: Parameters<typeof mocks.refreshAppSessionForRequest>
  ) => mocks.refreshAppSessionForRequest(...args),
}));

vi.mock('@tuturuuu/utils/api-proxy-guard', async () => ({
  ...(await vi.importActual<typeof import('@tuturuuu/utils/api-proxy-guard')>(
    '@tuturuuu/utils/api-proxy-guard'
  )),
  guardApiProxyRequest: async () => null,
}));

vi.mock('@tuturuuu/internal-api', () => ({
  getCurrentUserDefaultWorkspace: vi.fn(),
  withForwardedInternalApiAuth: vi.fn(),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  isPersonalWorkspace: vi.fn(async () => false),
}));

vi.mock('next-intl/middleware', () => ({
  default: () => () => NextResponse.next(),
}));

function request(
  origin: string,
  path: string,
  headers: Record<string, string> = {},
  basePath: string | undefined = BASE
) {
  return new NextRequest(`${origin}${path}`, {
    headers,
    ...(basePath ? { nextConfig: { basePath } } : {}),
  });
}

/** Runs the three satellite-session steps the mount must not reach. */
async function sessionSteps(origin: string, headers?: Record<string, string>) {
  mocks.refreshAppSessionForRequest.mockClear();
  mocks.consumeVerifyTokenRequest.mockClear();
  mocks.authProxy.mockClear();
  await proxy(request(origin, `${BASE}/api/v1/calendar/connections`, headers));
  const refresh = mocks.refreshAppSessionForRequest.mock.calls.length;
  await proxy(
    request(origin, `${BASE}/verify-token?token=t&nextUrl=%2Fpersonal`, headers)
  );
  const verify = mocks.consumeVerifyTokenRequest.mock.calls.length;
  mocks.authProxy.mockClear();
  await proxy(request(origin, `${BASE}/personal`, headers));
  const auth = mocks.authProxy.mock.calls.length;
  return { refresh, verify, auth };
}

const SATELLITE = { refresh: 1, verify: 1, auth: 1 };
const MOUNTED = { refresh: 0, verify: 0, auth: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authProxy.mockResolvedValue(NextResponse.next());
  mocks.consumeVerifyTokenRequest.mockResolvedValue(null);
  mocks.refreshAppSessionForRequest.mockResolvedValue({
    ok: true,
    response: NextResponse.next(),
  });
});

describe('host-scoped Calendar mount', () => {
  it('runs the satellite session flow on calendar.tuturuuu.com under the base path', async () => {
    expect(await sessionSteps(SUBDOMAIN)).toEqual(SATELLITE);
    expect(mocks.refreshAppSessionForRequest).toHaveBeenCalledWith(
      expect.any(NextRequest),
      { sessionMode: 'supabase-first', targetApp: 'calendar' }
    );
  });

  it('keeps the mounted branch on the apex host under the base path', async () => {
    expect(await sessionSteps(APEX)).toEqual(MOUNTED);
  });

  it('runs the satellite flow on the apex host without a base path', async () => {
    mocks.authProxy.mockClear();
    await proxy(request(APEX, '/personal', {}, undefined));
    expect(mocks.authProxy).toHaveBeenCalledTimes(1);
  });

  it.each<Record<string, string>>([
    { 'x-forwarded-host': 'tuturuuu.com' },
    { host: 'tuturuuu.com' },
    { forwarded: 'host=tuturuuu.com;proto=https' },
    {
      'x-forwarded-host': 'tuturuuu.com',
      'x-forwarded-proto': 'https',
      host: 'tuturuuu.com',
    },
  ])('ignores %o on the subdomain', async (headers) => {
    expect(await sessionSteps(SUBDOMAIN, headers)).toEqual(SATELLITE);
  });

  it.each<Record<string, string>>([
    { 'x-forwarded-host': 'calendar.tuturuuu.com' },
    { host: 'calendar.tuturuuu.com' },
    { 'x-forwarded-host': 'calendar.tuturuuu.com', host: 'evil.example' },
  ])('ignores %o on the apex', async (headers) => {
    expect(await sessionSteps(APEX, headers)).toEqual(MOUNTED);
  });

  it.each([
    ['https://TuTuRuuu.COM', true],
    ['https://tuturuuu.com', true],
    ['https://tuturuuu.com:443', true],
    ['https://tuturuuu.com.', false],
    ['https://tuturuuu.com:8443', false],
    ['http://tuturuuu.com:3000', false],
    ['https://www.tuturuuu.com', false],
    ['https://calendar.tuturuuu.com', false],
    ['https://tuturuuu.com.evil.example', false],
    ['https://eviltuturuuu.com', false],
    ['http://localhost:7806', false],
  ])('treats %s/calendar as mounted: %s', async (origin, expected) => {
    expect(isCalendarApexMountUrl(new URL(`${origin}${BASE}/x`), BASE)).toBe(
      expected
    );
    expect(await sessionSteps(origin)).toEqual(expected ? MOUNTED : SATELLITE);
  });

  it('requires a base path and a path under it', () => {
    expect(isCalendarApexMountUrl(new URL(`${APEX}${BASE}/x`), '')).toBe(false);
    expect(isCalendarApexMountUrl(new URL(`${APEX}/other`), BASE)).toBe(false);
    expect(isCalendarApexMountUrl(new URL(`${APEX}${BASE}`), BASE)).toBe(true);
  });
});
