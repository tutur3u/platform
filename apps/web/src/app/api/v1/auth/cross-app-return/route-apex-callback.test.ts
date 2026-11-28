import {
  createMastermindHandoffIssuerProof,
  createMastermindLoginTransaction,
  MASTERMIND_APEX_CALLBACK,
  MASTERMIND_HANDOFF_ISSUER_PARAM,
  MASTERMIND_HOST_CALLBACK,
  MASTERMIND_LOGIN_TRANSACTION_PARAM,
} from '@tuturuuu/auth/app-redeem-proof';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './route';

const NOW = 1_795_000_000;
const CHALLENGE = 'c'.repeat(43);
const LOGIN_SECRET = 'mastermind-test-signing-key'.repeat(2);
const APEX = `${MASTERMIND_APEX_CALLBACK}?nextUrl=%2Fship`;
const HOST = `${MASTERMIND_HOST_CALLBACK}?nextUrl=%2Fship`;

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  getClaims: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
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
  checkRequiredAccountMfa: vi.fn(async () => ({
    proof: null,
    status: 'allowed',
    userId: 'user-1',
  })),
}));
vi.mock('@tuturuuu/utils/upstash-rest', () => ({
  getUpstashRestRedisClient: async () => ({ set: mocks.claim }),
}));
vi.mock('@/lib/app-coordination/external-apps', () => ({
  getExternalAppByReturnUrl: vi.fn(async () => null),
}));
vi.mock('@/lib/infrastructure/log-drain', () => ({
  withRequestLogDrain: (_metadata: unknown, handler: () => Promise<Response>) =>
    handler(),
}));

const navigation = {
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
};

function signed(callback: string) {
  const url = new URL(callback);
  url.searchParams.set(
    MASTERMIND_LOGIN_TRANSACTION_PARAM,
    createMastermindLoginTransaction(
      url,
      CHALLENGE,
      false,
      LOGIN_SECRET,
      NOW * 1000
    )
  );
  return url.href;
}

async function open(returnUrl: string) {
  const params = new URLSearchParams({ returnUrl });
  const response = await GET(
    new NextRequest(
      `https://tuturuuu.com/api/v1/auth/cross-app-return?${params}`,
      { headers: navigation }
    )
  );
  return {
    location: new URL(response.headers.get('Location') ?? 'about:blank'),
    response,
  };
}

function resolve(returnUrl: string) {
  return POST(
    new NextRequest('https://tuturuuu.com/api/v1/auth/cross-app-return', {
      body: JSON.stringify({ generateToken: false, returnUrl }),
      method: 'POST',
    })
  );
}

describe('Mastermind apex callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW * 1000);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN', '');
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_INTERNAL_APP_DOMAINS', '');
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', LOGIN_SECRET);
    vi.stubEnv('MASTERMIND_SIGNIN_TRANSACTION_REQUIRED', 'true');
    vi.stubEnv('MASTERMIND_APEX_CALLBACK', 'true');
    mocks.claim.mockResolvedValue('OK');
    mocks.rpc.mockResolvedValue({ data: 'handoff-token', error: null });
    mocks.getUser.mockResolvedValue({
      data: { user: { email: 'user@example.com', id: 'user-1' } },
      error: null,
    });
    mocks.getClaims.mockResolvedValue({
      data: { claims: { aal: 'aal1', session_id: 's', sub: 'user-1' } },
      error: null,
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('refuses an apex callback while its flag is off', async () => {
    vi.stubEnv('MASTERMIND_APEX_CALLBACK', '');
    expect((await open(signed(APEX))).response.status).toBe(403);
    expect((await resolve(APEX)).status).toBe(403);
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('refuses an apex callback when transactions are not required', async () => {
    vi.stubEnv('MASTERMIND_SIGNIN_TRANSACTION_REQUIRED', '');
    expect((await open(signed(APEX))).response.status).toBe(403);
    expect((await resolve(APEX)).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('resolves the apex callback to Mastermind, never the platform', async () => {
    const response = await resolve(APEX);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      appName: 'mastermind',
      targetApp: 'mastermind',
    });
  });

  it('refuses an apex return without a valid Worker transaction', async () => {
    const changed = new URL(signed(APEX));
    changed.searchParams.set('nextUrl', '/projects');
    for (const returnUrl of [APEX, changed.href]) {
      expect((await open(returnUrl)).response.status).toBe(403);
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('returns to the exact signed apex callback with an apex-bound proof', async () => {
    const { location, response } = await open(signed(APEX));
    expect(response.status).toBe(303);
    expect(location.origin + location.pathname).toBe(MASTERMIND_APEX_CALLBACK);
    expect(location.searchParams.get('nextUrl')).toBe('/ship');
    expect(location.searchParams.has(MASTERMIND_LOGIN_TRANSACTION_PARAM)).toBe(
      false
    );
    expect(location.searchParams.get('token')).toBe('handoff-token');
    expect(location.searchParams.get('targetApp')).toBe('mastermind');
    expect(location.searchParams.get(MASTERMIND_HANDOFF_ISSUER_PARAM)).toBe(
      createMastermindHandoffIssuerProof(
        'handoff-token',
        MASTERMIND_APEX_CALLBACK
      )
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      'generate_cross_app_token_pkce',
      expect.objectContaining({
        p_code_challenge: CHALLENGE,
        p_target_app: 'mastermind',
      })
    );
  });

  it('binds a host return to the host callback while the apex flag is on', async () => {
    const { location, response } = await open(signed(HOST));
    expect(response.status).toBe(303);
    expect(location.origin + location.pathname).toBe(MASTERMIND_HOST_CALLBACK);
    expect(location.searchParams.get(MASTERMIND_HANDOFF_ISSUER_PARAM)).toBe(
      createMastermindHandoffIssuerProof(
        'handoff-token',
        MASTERMIND_HOST_CALLBACK
      )
    );
  });

  it('a transaction signed for the host never mints for the apex', async () => {
    const host = new URL(signed(HOST));
    const lifted = `${MASTERMIND_APEX_CALLBACK}${host.search}`;
    expect((await open(lifted)).response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
