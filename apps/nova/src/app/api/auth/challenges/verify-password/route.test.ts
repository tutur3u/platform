import { hashPassword } from '@tuturuuu/utils/crypto';
import { createSignedAccessToken } from '@tuturuuu/utils/signed-access-token';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  challengeAccessCookieName,
  createChallengeAccessGrant,
  hasChallengeAccess,
  verifyChallengeAccessGrant,
} from '@/lib/challenge-access';

const LEGACY_HASH =
  '7a37b85c8918eac19a9089c0fa5a2ab4dce3f90528dcdeec108b23ddf3607b99';

const CHALLENGE_ID = 'c1a2b3c4-d5e6-4f70-8192-a3b4c5d6e7f8';

const mocks = vi.hoisted(() => ({
  challenge: null as Record<string, unknown> | null,
  updates: [] as Array<{
    filters: Array<[string, unknown]>;
    payload: unknown;
  }>,
  user: { id: 'user-1' } as { id: string } | null,
}));

const limits = vi.hoisted(() => ({
  check: vi.fn(),
  refund: vi.fn(),
}));

vi.mock(
  '@tuturuuu/utils/abuse-protection/password-attempt-limits',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@tuturuuu/utils/abuse-protection/password-attempt-limits')
    >()),
    checkPasswordAttemptLimit: (...args: unknown[]) => limits.check(...args),
  })
);

vi.mock('@/lib/app-session', () => ({
  getNovaAppSessionUserFromRequest: () => mocks.user,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    schema: () => ({
      from: () => {
        const filters: Array<[string, unknown]> = [];
        let payload: unknown;
        const builder = {
          eq: (column: string, value: unknown) => {
            filters.push([column, value]);
            return builder;
          },
          select: () => builder,
          single: async () => ({
            data: mocks.challenge,
            error: mocks.challenge ? null : { message: 'missing' },
          }),
          // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are intentionally thenable.
          then: (resolve: (value: unknown) => unknown) => {
            mocks.updates.push({ filters, payload });
            return Promise.resolve({ error: null }).then(resolve);
          },
          update: (value: unknown) => {
            payload = value;
            return builder;
          },
        };
        return builder;
      },
    }),
  }),
}));

const { POST } = await import('./route');

function verify(password: unknown) {
  return POST(
    new Request('http://localhost/api/auth/challenges/verify-password', {
      body: JSON.stringify({ challengeId: CHALLENGE_ID, password }),
      headers: { 'cf-connecting-ip': '198.51.100.4' },
      method: 'POST',
    })
  );
}

function cookieStoreFrom(response: Response) {
  const values = new Map<string, string>();
  for (const header of response.headers.getSetCookie()) {
    const [pair] = header.split(';');
    const index = pair!.indexOf('=');
    values.set(pair!.slice(0, index), pair!.slice(index + 1));
  }
  return {
    raw: values,
    get: (name: string) => {
      const value = values.get(name);
      return value ? { value } : undefined;
    },
  };
}

describe('Nova challenge password verification', () => {
  it('rejects grants issued by the retired password verifier', () => {
    const options = { secret: 'test-only-reset-policy-secret-00000000' };
    const old = createSignedAccessToken(
      'nova-challenge-access',
      { cid: CHALLENGE_ID, sub: 'user-1' },
      600,
      options
    );
    expect(
      verifyChallengeAccessGrant(
        old.token,
        { challengeId: CHALLENGE_ID, userId: 'user-1' },
        options
      )
    ).toBe(false);
  });
  beforeEach(() => {
    mocks.updates.length = 0;
    mocks.user = { id: 'user-1' };
    vi.clearAllMocks();
    limits.check.mockResolvedValue({ allowed: true, refund: limits.refund });
  });

  it('returns 429 with retryAfter once the failure budget is spent', async () => {
    limits.check.mockResolvedValue({ allowed: false, retryAfter: 300 });
    mocks.challenge = {
      duration: 600,
      id: CHALLENGE_ID,
      password_hash: await hashPassword('open sesame'),
      password_salt: null,
    };

    const response = await verify('open sesame');

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('300');
    await expect(response.json()).resolves.toMatchObject({ retryAfter: 300 });
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(limits.check).toHaveBeenCalledWith({
      scope: 'nova-challenge',
      target: `${CHALLENGE_ID}:user-1`,
      userId: 'user-1',
    });
  });

  it.each(['password', 'wrong', LEGACY_HASH])(
    'requires reset for a legacy row with attempt %s',
    async (password) => {
      mocks.challenge = {
        duration: 3600,
        id: CHALLENGE_ID,
        password_hash: LEGACY_HASH,
        password_salt: 'salt',
      };
      const response = await verify(password);
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        code: 'PASSWORD_RESET_REQUIRED',
      });
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(mocks.updates).toEqual([]);
      expect(limits.check).not.toHaveBeenCalled();
      expect(limits.refund).not.toHaveBeenCalled();
    }
  );

  it('accepts a scrypt hash without rewriting it', async () => {
    mocks.challenge = {
      duration: 600,
      id: CHALLENGE_ID,
      password_hash: await hashPassword('open sesame'),
      password_salt: null,
    };

    const response = await verify('open sesame');

    expect(response.status).toBe(200);
    expect(limits.refund).toHaveBeenCalledOnce();
    expect(mocks.updates).toEqual([]);
    expect(
      cookieStoreFrom(response).get(challengeAccessCookieName(CHALLENGE_ID))
    ).toBeDefined();
    const cookies = cookieStoreFrom(response);
    const setCookies = response.headers.getSetCookie().join('\n');
    expect(setCookies).not.toContain(mocks.challenge!.password_hash as string);
    expect(setCookies).toMatch(/HttpOnly/i);
    expect(cookies.raw.get('token')).toBe('');
    expect(
      hasChallengeAccess(
        {
          id: CHALLENGE_ID,
          password_hash: mocks.challenge!.password_hash as string,
        },
        cookies,
        'user-1'
      )
    ).toBe(true);
    expect(
      hasChallengeAccess(
        {
          id: CHALLENGE_ID,
          password_hash: mocks.challenge!.password_hash as string,
        },
        cookies,
        'user-2'
      )
    ).toBe(false);
  });

  it('rejects wrong passwords and stored hashes presented as passwords', async () => {
    const storedHash = await hashPassword('open sesame');
    mocks.challenge = {
      duration: 600,
      id: CHALLENGE_ID,
      password_hash: storedHash,
      password_salt: null,
    };

    for (const attempt of ['wrong', storedHash]) {
      const response = await verify(attempt);
      expect(response.status).toBe(401);
      expect(response.headers.getSetCookie()).toEqual([]);
    }
    expect(mocks.updates).toEqual([]);
    expect(limits.check).toHaveBeenCalledTimes(2);
    expect(limits.refund).not.toHaveBeenCalled();
  });

  it('requires a signed-in Nova user', async () => {
    mocks.user = null;
    expect((await verify('anything')).status).toBe(401);
  });

  it('rejects an already-issued grant while the challenge still requires reset', () => {
    const grant = createChallengeAccessGrant({
      challengeId: CHALLENGE_ID,
      userId: 'user-1',
      ttlSeconds: 600,
    });
    expect(
      hasChallengeAccess(
        { id: CHALLENGE_ID, password_hash: LEGACY_HASH },
        { get: () => ({ value: grant.token }) },
        'user-1'
      )
    ).toBe(false);
  });

  it('does not grant access from a cookie holding the stored hash', () => {
    const storedHash = LEGACY_HASH;
    const challenge = { id: CHALLENGE_ID, password_hash: storedHash };
    const store = (name: string, value: string) => ({
      get: (key: string) => (key === name ? { value } : undefined),
    });

    expect(
      hasChallengeAccess(challenge, store('token', storedHash), 'user-1')
    ).toBe(false);
    expect(
      hasChallengeAccess(
        challenge,
        store(challengeAccessCookieName(CHALLENGE_ID), storedHash),
        'user-1'
      )
    ).toBe(false);
    expect(
      hasChallengeAccess(
        { id: CHALLENGE_ID, password_hash: null },
        store('x', ''),
        null
      )
    ).toBe(true);
  });
});
