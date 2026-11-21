import { readMfaTransfer } from '@tuturuuu/utils/required-mfa-transfer';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isFreshMfaProof } from '@/lib/auth/mfa-proof-age';
import { POST } from './route';

const NOW = 1_795_000_000;
const HOUR_AGO = NOW - 3600;
/** A first-party app that receives a token. */
const MASTERMIND = 'https://mastermind.tuturuuu.com/verify-token?nextUrl=%2Fen';
/** A registered app that is not Tuturuuu's own. */
const PARTNER = 'https://fysh.example/auth/callback';

const mocks = vi.hoisted(() => ({
  account: { proof: null, status: 'allowed', userId: 'user-1' } as {
    proof: unknown;
    status: string;
    userId?: string;
  },
  getClaims: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => ({})),
  createClient: vi.fn(async () => ({
    auth: {
      getClaims: mocks.getClaims,
      getUser: vi.fn(async () => ({
        data: { user: { email: 'user@example.com', id: 'user-1' } },
        error: null,
      })),
    },
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

/** The session as Supabase signs it: a second factor verified at `totpAt`. */
const session = (totpAt: number) => ({
  aal: 'aal2',
  amr: [
    { method: 'password', timestamp: HOUR_AGO - 60 },
    { method: 'totp', timestamp: totpAt },
  ],
  session_id: 'session-1',
  sub: 'user-1',
});

async function mint(body: Record<string, unknown>) {
  const response = await POST(
    new NextRequest('http://localhost/api/v1/auth/cross-app-return', {
      body: JSON.stringify({ returnUrl: MASTERMIND, ...body }),
      method: 'POST',
    })
  );
  return { body: await response.json(), status: response.status };
}

/** The proof inside the token minted by the last successful call. */
function mintedProof(targetApp = 'mastermind') {
  const [, args] = mocks.rpc.mock.calls.at(-1) as [
    string,
    { p_session_data: Record<string, unknown> },
  ];
  return readMfaTransfer(args.p_session_data.mfaTransfer, 'user-1', targetApp);
}

const refused = { body: { code: 'MFA_REQUIRED' }, status: 403 };

describe('cross-app return with a maximum second-factor age', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW * 1000);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN', '');
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_INTERNAL_APP_DOMAINS', '');
    mocks.account = { proof: null, status: 'allowed', userId: 'user-1' };
    mocks.rpc.mockResolvedValue({ data: 'handoff-token', error: null });
    mocks.getClaims.mockResolvedValue({
      data: { claims: session(HOUR_AGO) },
      error: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('mints as before when no age is asked for, with the proof the session has', async () => {
    expect((await mint({})).status).toBe(200);
    expect(mintedProof()).toMatchObject({ verifiedAt: HOUR_AGO });
  });

  it('refuses a proof older than asked, and mints once the second factor is verified again', async () => {
    // The session satisfies the account policy but verified an hour ago.
    expect(await mint({ mfaMaxAge: 30 })).toEqual(refused);
    // Signing in again hands back the same session: still refused, however
    // often it is asked.
    expect(await mint({ mfaMaxAge: 30 })).toEqual(refused);
    expect(mocks.rpc).not.toHaveBeenCalled();

    // The step-up adds a new second-factor entry to the same session.
    mocks.getClaims.mockResolvedValue({
      data: { claims: session(NOW - 5) },
      error: null,
    });
    const minted = await mint({ mfaMaxAge: 30 });
    expect(minted.status).toBe(200);
    expect(minted.body.returnUrl).toContain('token=handoff-token');
    // The token carries the new proof, which is what a reply needs.
    const proof = mintedProof();
    expect(proof).toMatchObject({
      sessionId: 'session-1',
      verifiedAt: NOW - 5,
    });
    expect(isFreshMfaProof(proof, 1800, NOW)).toBe(true);
    expect(
      isFreshMfaProof({ ...proof!, verifiedAt: HOUR_AGO }, 1800, NOW)
    ).toBe(false);
  });

  it('counts the age inclusively, in whole seconds', async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: session(NOW - 30) },
      error: null,
    });
    expect((await mint({ mfaMaxAge: 30 })).status).toBe(200);
    mocks.getClaims.mockResolvedValue({
      data: { claims: session(NOW - 31) },
      error: null,
    });
    expect(await mint({ mfaMaxAge: 30 })).toEqual(refused);
    expect((await mint({ mfaMaxAge: 31 })).status).toBe(200);
  });

  it('refuses a proof that is missing, expired or dated in the future', async () => {
    // No second factor in the session at all.
    mocks.getClaims.mockResolvedValue({
      data: {
        claims: {
          aal: 'aal1',
          amr: [{ method: 'password', timestamp: NOW - 5 }],
          session_id: 'session-1',
          sub: 'user-1',
        },
      },
      error: null,
    });
    expect(await mint({ mfaMaxAge: 3600 })).toEqual(refused);
    // Unverifiable claims prove nothing.
    mocks.getClaims.mockResolvedValue({
      data: { claims: session(NOW - 5) },
      error: new Error('bad signature'),
    });
    expect(await mint({ mfaMaxAge: 3600 })).toEqual(refused);
    // A proof the account check supplies is judged the same way.
    for (const proof of [
      { sessionId: 'session-1', verifiedAt: HOUR_AGO - 1 },
      { expiresAt: NOW - 1, sessionId: 'session-1', verifiedAt: NOW - 5 },
      { sessionId: 'session-1', verifiedAt: NOW + 60 },
    ]) {
      mocks.account = { proof, status: 'allowed', userId: 'user-1' };
      expect(await mint({ mfaMaxAge: 3600 })).toEqual(refused);
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('only ever adds a requirement: the account policy still decides first', async () => {
    // A recent proof does not help an account the policy refuses.
    mocks.getClaims.mockResolvedValue({
      data: { claims: session(NOW - 5) },
      error: null,
    });
    mocks.account = { proof: null, status: 'required' };
    expect(await mint({ mfaMaxAge: 3600 })).toEqual(refused);
    mocks.account = { proof: null, status: 'unavailable' };
    expect(await mint({ mfaMaxAge: 3600 })).toEqual({
      body: { code: 'AUTH_UNAVAILABLE' },
      status: 503,
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('refuses a value outside 30 to 3600 seconds instead of guessing one', async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: session(NOW - 5) },
      error: null,
    });
    for (const mfaMaxAge of [
      0,
      -30,
      29,
      3601,
      86_400,
      30.5,
      '1800',
      null,
      true,
      [60],
      { seconds: 60 },
      Number.MAX_SAFE_INTEGER,
    ]) {
      const answer = await mint({ mfaMaxAge });
      expect([mfaMaxAge, answer.status, answer.body.code]).toEqual([
        mfaMaxAge,
        400,
        'INVALID_MFA_MAX_AGE',
      ]);
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
    for (const mfaMaxAge of [30, 300, 3600])
      expect((await mint({ mfaMaxAge })).status).toBe(200);
  });

  it('leaves the return URL to its own validation', async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: session(NOW - 5) },
      error: null,
    });
    const minted = await mint({ mfaMaxAge: 30 });
    const returnUrl = new URL(minted.body.returnUrl);
    expect(returnUrl.origin + returnUrl.pathname).toBe(
      'https://mastermind.tuturuuu.com/verify-token'
    );
    expect(returnUrl.searchParams.has('mfaMaxAge')).toBe(false);
  });

  it('is asked by first-party apps only: another registered app is minted as if it had not asked', async () => {
    // Otherwise any registered app could make the user verify again at will.
    const minted = await mint({ mfaMaxAge: 30, returnUrl: PARTNER });
    expect(minted.status).toBe(200);
    expect(mintedProof('fysh')).toMatchObject({ verifiedAt: HOUR_AGO });
    // Its value is still held to the range.
    expect((await mint({ mfaMaxAge: 5, returnUrl: PARTNER })).status).toBe(400);
  });

  it('changes nothing where no token is handed out', async () => {
    // A lookup of the target, and an app mounted on the root origin, which
    // shares the root session: neither carries a proof to judge.
    const lookup = await mint({ generateToken: false, mfaMaxAge: 30 });
    expect([lookup.status, lookup.body]).toEqual([
      200,
      { appName: 'mastermind', targetApp: 'mastermind' },
    ]);
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_ACTIVE_APP_MOUNTS', 'inventory');
    const mounted = await mint({
      mfaMaxAge: 30,
      returnUrl:
        'https://tuturuuu.com/inventory/verify-token?nextUrl=%2Fpersonal%2Fcatalog',
    });
    expect(mounted.status).toBe(200);
    expect(mounted.body.returnUrl).not.toContain('token=');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('leaves the other refusals in their order', async () => {
    mocks.getClaims.mockResolvedValue({
      data: { claims: session(NOW - 5) },
      error: null,
    });
    // A different account than the one confirmed never mints, fresh or not.
    const changed = await mint({ expectedUserId: 'user-2', mfaMaxAge: 30 });
    expect([changed.status, changed.body]).toEqual([
      409,
      { code: 'ACCOUNT_CHANGED' },
    ]);
    // A malformed challenge is refused before the age is looked at.
    const challenge = await mint({
      codeChallenge: 'short',
      codeChallengeMethod: 'S256',
      mfaMaxAge: 30,
    });
    expect([challenge.status, challenge.body.code]).toEqual([
      400,
      'INVALID_CODE_CHALLENGE',
    ]);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
