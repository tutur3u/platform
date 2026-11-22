import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const NOW = 1_795_000_000;
const OWNER = '11111111-1111-4111-8111-111111111111';
// The shape of a provider access token; never verified in these tests.
const BEARER = ['eyJhbGciOiJFUzI1NiJ9', 'eyJzdWIiOiJvd25lciJ9', 'sig'].join(
  '.'
);

const mocks = vi.hoisted(() => ({
  /** What the account check asks of the client it is handed. */
  account: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', async () => ({
  createAdminClient: async () => ({}),
  // The real predicate, so the tests read the credential as production does.
  getBearerAccessToken: (
    await vi.importActual<typeof import('@tuturuuu/supabase/next/server')>(
      '@tuturuuu/supabase/next/server'
    )
  ).getBearerAccessToken,
}));
vi.mock('@tuturuuu/utils/required-mfa-request', () => ({
  checkRequiredAccountMfa: (...args: unknown[]) => mocks.account(...args),
}));

type Claims = Record<string, unknown> | null;

/**
 * A client the way `createClient(request)` builds one: from a bearer it
 * holds no session, so it has claims only for a token it is given.
 */
function client(kind: 'bearer' | 'cookie', claims: Claims) {
  const getClaims = vi.fn(async (jwt?: string) => {
    const readable = kind === 'cookie' ? jwt === undefined : jwt === BEARER;
    return { data: readable && claims ? { claims } : null, error: null };
  });
  const getUser = vi.fn(async () => ({
    data: { user: { id: OWNER } },
    error: null,
  }));
  return { auth: { getClaims, getUser } };
}

const request = (authorization?: string) => ({
  headers: new Headers(authorization ? { authorization } : {}),
  url: 'https://tuturuuu.com/api/v1/mastermind/fleet/replies',
});

const session = (totpAt: number, sub = OWNER) => ({
  aal: 'aal2',
  amr: [
    { method: 'password', timestamp: NOW - 7200 },
    { method: 'totp', timestamp: totpAt },
  ],
  session_id: 'session-1',
  sub,
});

const assurance = () => import('@/lib/mastermind/fleet/bridge');

describe('fleet assurance reads the proof from the credential the request carried', () => {
  beforeEach(() => {
    mocks.account.mockReset();
    // An account without the required policy: the check asks for no claims.
    mocks.account.mockResolvedValue({
      proof: null,
      status: 'allowed',
      userId: OWNER,
    });
  });

  it('accepts a reply from a phone whose session verified its second factor just now', async () => {
    const { replyAssurance } = await assurance();
    const supabase = client('bearer', session(NOW - 5));
    const verdict = await replyAssurance(
      request(`Bearer ${BEARER}`),
      { userId: OWNER, supabase },
      1800,
      NOW
    );
    expect(verdict).toMatchObject({
      proof: { sessionId: 'session-1', verifiedAt: NOW - 5 },
      status: 'allowed',
    });
    // The claims were read from that very bearer, by name.
    expect(supabase.auth.getClaims).toHaveBeenCalledWith(BEARER);
  });

  it('still refuses a phone whose proof is older than the window', async () => {
    const { replyAssurance } = await assurance();
    for (const [claims, label] of [
      [session(NOW - 3600), 'an hour old'],
      [session(NOW - 5, 'another-user'), 'for another user'],
      [{ ...session(NOW - 5), aal: 'aal1', amr: [] }, 'without a factor'],
      [null, 'unreadable'],
    ] as const) {
      const verdict = await replyAssurance(
        request(`Bearer ${BEARER}`),
        { userId: OWNER, supabase: client('bearer', claims) },
        1800,
        NOW
      );
      expect([label, verdict]).toEqual([label, { status: 'required' }]);
    }
  });

  it('reads a browser session as before, without naming a token', async () => {
    const { replyAssurance } = await assurance();
    const supabase = client('cookie', session(NOW - 5));
    const verdict = await replyAssurance(
      request(),
      { userId: OWNER, supabase },
      1800,
      NOW
    );
    expect(verdict.status).toBe('allowed');
    expect(supabase.auth.getClaims).toHaveBeenCalledWith();
  });

  it('never reads an Authorization value the client did not authenticate with', async () => {
    const { replyAssurance } = await assurance();
    // A browser session whose proof is an hour old, and beside it a header
    // the server client ignores, carrying a token with a recent proof: say
    // another session of the same account.
    for (const authorization of [
      `bearer ${BEARER}`,
      `BEARER ${BEARER}`,
      `Bearer\t${BEARER}`,
      `Bearer${BEARER}`,
      `Token ${BEARER}`,
    ]) {
      const supabase = client('cookie', session(NOW - 3600));
      const verdict = await replyAssurance(
        request(authorization),
        { userId: OWNER, supabase },
        1800,
        NOW
      );
      // Judged by the cookie session's own proof, which is too old.
      expect([authorization, verdict]).toEqual([
        authorization,
        { status: 'required' },
      ]);
      expect(supabase.auth.getClaims).toHaveBeenCalledWith();
      expect(supabase.auth.getClaims).not.toHaveBeenCalledWith(BEARER);
    }
  });

  it('hands the account check a client that can read a bearer session too', async () => {
    const { readAssurance, replyAssurance } = await assurance();
    // An account under the required policy: the check itself reads claims.
    mocks.account.mockImplementation(async (_request, dependencies) => {
      const checked = await dependencies.createUserClient();
      const user = await checked.auth.getUser();
      const claims = await checked.auth.getClaims();
      return user.data.user.id === OWNER && claims.data?.claims.sub === OWNER
        ? {
            proof: { sessionId: 'session-1', verifiedAt: NOW - 5 },
            status: 'allowed',
            userId: OWNER,
          }
        : { status: 'invalid' };
    });
    for (const [kind, authorization] of [
      ['bearer', `Bearer ${BEARER}`],
      ['cookie', undefined],
    ] as const) {
      const principal = {
        userId: OWNER,
        supabase: client(kind, session(NOW - 5)),
      };
      expect(await readAssurance(request(authorization), principal, NOW)).toBe(
        'allowed'
      );
      expect(
        (await replyAssurance(request(authorization), principal, 1800, NOW))
          .status
      ).toBe('allowed');
    }
  });

  it('never reads an app session token as a provider token', async () => {
    const { replyAssurance } = await assurance();
    const appToken = `ttr_app_${'a'.repeat(24)}`;
    mocks.account.mockResolvedValue({
      proof: { sessionId: 'session-1', verifiedAt: NOW - 5 },
      status: 'allowed',
      userId: OWNER,
    });
    const supabase = client('bearer', session(NOW - 5));
    const verdict = await replyAssurance(
      request('Bearer ttr_app_other_candidate'),
      { userId: OWNER, supabase, appSessionToken: appToken },
      1800,
      NOW
    );
    // The proof inside the signed app token decides; no claims are read.
    expect(verdict.status).toBe('allowed');
    expect(supabase.auth.getClaims).not.toHaveBeenCalled();
    expect(mocks.account.mock.calls[0]![2]).toEqual({
      appToken,
      userId: OWNER,
    });
  });
});
