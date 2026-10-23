import {
  hashLegacyPassword,
  hashPassword,
  verifyPassword,
} from '@tuturuuu/utils/crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  challengeAccessCookieName,
  hasChallengeAccess,
} from '@/lib/challenge-access';

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
  beforeEach(() => {
    mocks.updates.length = 0;
    mocks.user = { id: 'user-1' };
    vi.clearAllMocks();
    limits.check.mockResolvedValue({ allowed: true });
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
      ip: '198.51.100.4',
    });
  });

  it('upgrades a legacy hash and issues a grant without password material', async () => {
    const legacyHash = hashLegacyPassword('open sesame', 'legacy-salt');
    mocks.challenge = {
      duration: 3600,
      id: CHALLENGE_ID,
      password_hash: legacyHash,
      password_salt: 'legacy-salt',
    };

    const response = await verify('open sesame');

    expect(response.status).toBe(200);
    expect(mocks.updates).toHaveLength(1);
    expect(mocks.updates[0]!.filters).toEqual([
      ['id', CHALLENGE_ID],
      ['password_hash', legacyHash],
    ]);
    const upgraded = mocks.updates[0]!.payload as {
      password_hash: string;
      password_salt: null;
    };
    expect(upgraded.password_salt).toBeNull();
    expect(
      (await verifyPassword('open sesame', { hash: upgraded.password_hash }))
        .valid
    ).toBe(true);

    const cookies = cookieStoreFrom(response);
    const setCookies = response.headers.getSetCookie().join('\n');
    expect(setCookies).not.toContain(legacyHash);
    expect(setCookies).toMatch(/HttpOnly/i);
    expect(cookies.raw.get('token')).toBe('');
    expect(
      hasChallengeAccess(
        { id: CHALLENGE_ID, password_hash: upgraded.password_hash },
        cookies,
        'user-1'
      )
    ).toBe(true);
    expect(
      hasChallengeAccess(
        { id: CHALLENGE_ID, password_hash: upgraded.password_hash },
        cookies,
        'user-2'
      )
    ).toBe(false);
  });

  it('accepts a scrypt hash without rewriting it', async () => {
    mocks.challenge = {
      duration: 600,
      id: CHALLENGE_ID,
      password_hash: await hashPassword('open sesame'),
      password_salt: null,
    };

    const response = await verify('open sesame');

    expect(response.status).toBe(200);
    expect(mocks.updates).toEqual([]);
    expect(
      cookieStoreFrom(response).get(challengeAccessCookieName(CHALLENGE_ID))
    ).toBeDefined();
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
  });

  it('requires a signed-in Nova user', async () => {
    mocks.user = null;
    expect((await verify('anything')).status).toBe(401);
  });

  it('does not grant access from a cookie holding the stored hash', () => {
    const storedHash = hashLegacyPassword('open sesame', 'legacy-salt');
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
