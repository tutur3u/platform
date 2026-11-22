import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const NOW = 1_795_000_000;
const MASTERMIND =
  'https://mastermind.tuturuuu.com/verify-token?nextUrl=%2Fship';
const PARTNER = 'https://fysh.example/auth/callback';
const CHALLENGE = 'c'.repeat(43);

const mocks = vi.hoisted(() => ({
  account: { proof: null, status: 'allowed', userId: 'user-1' } as {
    proof: unknown;
    status: string;
    userId?: string;
  },
  getClaims: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => ({})),
  createClient: vi.fn(async () => ({
    auth: { getClaims: mocks.getClaims, getUser: mocks.getUser },
    rpc: mocks.rpc,
  })),
}));
vi.mock('@tuturuuu/utils/required-mfa-request', () => ({
  checkRequiredAccountMfa: vi.fn(async () => mocks.account),
}));
vi.mock('@/lib/app-coordination/external-apps', () => ({
  getExternalAppByReturnUrl: vi.fn(async () => ({
    callbackPaths: [],
    displayName: 'Fysh',
    enabled: true,
    id: 'fysh',
    origins: ['https://fysh.example'],
    requirePkce: false,
  })),
}));
vi.mock('@/lib/infrastructure/log-drain', () => ({
  withRequestLogDrain: (_metadata: unknown, handler: () => Promise<Response>) =>
    handler(),
}));

const navigation = {
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
};

function query(extra: Record<string, string> = {}) {
  return new URLSearchParams({
    returnUrl: MASTERMIND,
    code_challenge: CHALLENGE,
    code_challenge_method: 'S256',
    ...extra,
  });
}

async function open(
  params: URLSearchParams,
  headers: Record<string, string> = navigation
) {
  const response = await GET(
    new NextRequest(
      `https://tuturuuu.com/api/v1/auth/cross-app-return?${params}`,
      {
        headers,
      }
    )
  );
  return {
    location: new URL(response.headers.get('Location') ?? 'about:blank'),
    response,
  };
}

/** The `/login` fallback keeps every parameter the satellite sent. */
function expectLogin(location: URL, params: URLSearchParams) {
  expect(location.origin + location.pathname).toBe(
    'https://tuturuuu.com/login'
  );
  expect(location.searchParams.toString()).toBe(params.toString());
}

describe('signed-in continue for a first-party app', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW * 1000);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN', '');
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_INTERNAL_APP_DOMAINS', '');
    mocks.account = { proof: null, status: 'allowed', userId: 'user-1' };
    mocks.rpc.mockResolvedValue({ data: 'handoff-token', error: null });
    mocks.getUser.mockResolvedValue({
      data: { user: { email: 'user@example.com', id: 'user-1' } },
      error: null,
    });
    mocks.getClaims.mockResolvedValue({
      data: {
        claims: {
          aal: 'aal2',
          amr: [{ method: 'totp', timestamp: NOW - 10 }],
          session_id: 'session-1',
          sub: 'user-1',
        },
      },
      error: null,
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns a signed-in navigation straight to the app with a bound handoff', async () => {
    const { response, location } = await open(query());
    expect(response.status).toBe(303);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(location.origin + location.pathname).toBe(
      'https://mastermind.tuturuuu.com/verify-token'
    );
    expect(location.searchParams.get('token')).toBe('handoff-token');
    expect(location.searchParams.get('nextUrl')).toBe('/ship');
    expect(mocks.rpc).toHaveBeenCalledWith(
      'generate_cross_app_token_pkce',
      expect.objectContaining({
        p_code_challenge: CHALLENGE,
        p_target_app: 'mastermind',
      })
    );
  });

  it('shows the sign-in page when there is no session', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const params = query();
    const { response, location } = await open(params);
    expect(response.status).toBe(303);
    expectLogin(location, params);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('leaves the second-factor step-up to the sign-in page', async () => {
    const stale = query({ mfaMaxAge: '30' });
    mocks.getClaims.mockResolvedValue({
      data: {
        claims: {
          aal: 'aal2',
          amr: [{ method: 'totp', timestamp: NOW - 3600 }],
          session_id: 'session-1',
          sub: 'user-1',
        },
      },
      error: null,
    });
    expectLogin((await open(stale)).location, stale);
    mocks.account = { proof: null, status: 'required', userId: 'user-1' };
    const required = query();
    expectLogin((await open(required)).location, required);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('never mints for a request that is not a top-level navigation', async () => {
    const requests: Record<string, string>[] = [
      {},
      { 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty' },
      { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'iframe' },
      { 'sec-fetch-mode': 'no-cors', 'sec-fetch-dest': 'image' },
    ];
    for (const headers of requests) {
      const params = query();
      expectLogin((await open(params, headers)).location, params);
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('keeps interactive sign-ins and other apps on the sign-in page', async () => {
    for (const params of [
      query({ confirmAccount: '1' }),
      query({ multiAccount: 'true' }),
      query({ expectedUserId: 'user-1' }),
      query({ returnUrl: PARTNER }),
      // Only browser-bound Worker-only targets continue here.
      query({
        returnUrl: 'https://calendar.tuturuuu.com/verify-token?nextUrl=%2F',
      }),
      // Web itself never receives a minted handoff.
      query({ returnUrl: 'https://tuturuuu.com/verify-token?nextUrl=%2Fhome' }),
      query({ returnUrl: 'https://evil.example/verify-token' }),
      new URLSearchParams(),
      // A Mastermind handoff without the browser's challenge is never minted.
      new URLSearchParams({ returnUrl: MASTERMIND }),
    ]) {
      expectLogin((await open(params)).location, params);
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
