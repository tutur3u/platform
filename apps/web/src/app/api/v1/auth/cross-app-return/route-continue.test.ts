import {
  createMastermindLoginTransaction,
  createMastermindHandoffIssuerProof,
  MASTERMIND_HANDOFF_ISSUER_PARAM,
  MASTERMIND_LOGIN_TRANSACTION_PARAM,
} from '@tuturuuu/auth/app-redeem-proof';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './route';

const NOW = 1_795_000_000;
const MASTERMIND =
  'https://mastermind.tuturuuu.com/verify-token?nextUrl=%2Fship';
const PARTNER = 'https://fysh.example/auth/callback';
const CHALLENGE = 'c'.repeat(43);
const LOGIN_SECRET = 'mastermind-test-signing-key'.repeat(2);

const mocks = vi.hoisted(() => ({
  account: { proof: null, status: 'allowed', userId: 'user-1' } as {
    proof: unknown;
    status: string;
    userId?: string;
  },
  getClaims: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
  claim: vi.fn(),
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => undefined,
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
vi.mock('@tuturuuu/utils/upstash-rest', () => ({
  getUpstashRestRedisClient: async () => ({ set: mocks.claim }),
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
  const callback = new URL(MASTERMIND);
  callback.searchParams.set(
    MASTERMIND_LOGIN_TRANSACTION_PARAM,
    createMastermindLoginTransaction(
      callback,
      CHALLENGE,
      false,
      LOGIN_SECRET,
      NOW * 1000
    )
  );
  return new URLSearchParams({
    returnUrl: callback.href,
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
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', LOGIN_SECRET);
    vi.stubEnv('MASTERMIND_SIGNIN_TRANSACTION_REQUIRED', 'true');
    mocks.claim.mockReset().mockResolvedValue('OK');
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
    expect(location.searchParams.get(MASTERMIND_HANDOFF_ISSUER_PARAM)).toBe(
      createMastermindHandoffIssuerProof('handoff-token')
    );
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
      {
        'sec-fetch-mode': 'cors',
        'sec-fetch-dest': 'empty',
        'sec-fetch-site': 'same-origin',
      },
      { ...navigation, 'sec-purpose': 'prefetch' },
      { 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'iframe' },
      { 'sec-fetch-mode': 'no-cors', 'sec-fetch-dest': 'image' },
    ];
    for (const headers of requests) {
      const params = query();
      expect((await open(params, headers)).response.status).toBe(403);
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('refuses a same-origin fetch with a caller-supplied challenge', async () => {
    const response = await POST(
      new NextRequest('https://tuturuuu.com/api/v1/auth/cross-app-return', {
        method: 'POST',
        headers: { ...navigation, origin: 'https://tuturuuu.com' },
        body: JSON.stringify({
          codeChallenge: CHALLENGE,
          codeChallengeMethod: 'S256',
          returnUrl: MASTERMIND,
        }),
      })
    );
    expect(response.status).toBe(403);
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('refuses a navigation with no proof or with a changed callback', async () => {
    const changed = new URL(query().get('returnUrl')!);
    changed.searchParams.set('nextUrl', '/projects');
    for (const returnUrl of [MASTERMIND, changed.href]) {
      expect((await open(query({ returnUrl }))).response.status).toBe(403);
    }
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('claims the server-created transaction once before minting', async () => {
    mocks.claim.mockResolvedValueOnce('OK').mockResolvedValueOnce(null);
    const params = query({ code_challenge: 'd'.repeat(43) });
    const responses = await Promise.all([open(params), open(params)]);
    expect(responses.map(({ response }) => response.status).sort()).toEqual([
      303, 409,
    ]);
    expect(mocks.claim).toHaveBeenCalledWith(
      `mastermind:login:used:${CHALLENGE}`,
      '1',
      { ex: 600, nx: true }
    );
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc.mock.calls[0]?.[1].p_code_challenge).toBe(CHALLENGE);
  });

  it('before the requirement is on, keeps the PKCE handoff only for a return without a transaction', async () => {
    vi.stubEnv('MASTERMIND_SIGNIN_TRANSACTION_REQUIRED', '');
    const legacy = new URLSearchParams({
      returnUrl: MASTERMIND,
      code_challenge: CHALLENGE,
      code_challenge_method: 'S256',
    });
    const { response, location } = await open(legacy);
    expect(response.status).toBe(303);
    expect(location.searchParams.get('token')).toBe('handoff-token');
    expect(location.searchParams.has(MASTERMIND_HANDOFF_ISSUER_PARAM)).toBe(
      false
    );
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith(
      'generate_cross_app_token_pkce',
      expect.objectContaining({ p_code_challenge: CHALLENGE })
    );
    mocks.rpc.mockClear();

    // A transaction that is present is always verified.
    const changed = new URL(query().get('returnUrl')!);
    changed.searchParams.set('nextUrl', '/projects');
    expect(
      (await open(query({ returnUrl: changed.href }))).response.status
    ).toBe(403);
    // A signed transaction still takes the claimed, issuer-proved path.
    const signed = await open(query({ code_challenge: 'd'.repeat(43) }));
    expect(signed.response.status).toBe(303);
    expect(
      signed.location.searchParams.get(MASTERMIND_HANDOFF_ISSUER_PARAM)
    ).toBe(createMastermindHandoffIssuerProof('handoff-token'));
    expect(mocks.claim).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc.mock.calls[0]?.[1].p_code_challenge).toBe(CHALLENGE);
  });

  it('fails closed when the replay store is unavailable', async () => {
    mocks.claim.mockRejectedValueOnce(new Error('offline'));
    expect((await open(query())).response.status).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('keeps interactive sign-ins and other apps on the sign-in page', async () => {
    for (const params of [
      query({ confirmAccount: '1' }),
      query({ multiAccount: 'true' }),
      query({ returnUrl: PARTNER }),
      // Only browser-bound Worker-only targets continue here.
      query({
        returnUrl: 'https://calendar.tuturuuu.com/verify-token?nextUrl=%2F',
      }),
      // Web itself never receives a minted handoff.
      query({ returnUrl: 'https://tuturuuu.com/verify-token?nextUrl=%2Fhome' }),
      query({ returnUrl: 'https://evil.example/verify-token' }),
      new URLSearchParams(),
    ]) {
      expectLogin((await open(params)).location, params);
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
