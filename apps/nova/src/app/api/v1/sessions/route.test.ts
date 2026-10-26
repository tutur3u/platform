import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  challengeAccessCookieName,
  createChallengeAccessGrant,
} from '@/lib/challenge-access';

const CHALLENGE_ID = 'c1a2b3c4-d5e6-4f70-8192-a3b4c5d6e7f8';

const mocks = vi.hoisted(() => ({
  challenge: null as Record<string, unknown> | null,
  dailyAttempts: 0,
  getRole: vi.fn(),
  getUser: vi.fn(),
  inserts: [] as unknown[],
  totalAttempts: 0,
  insertError: null as { code: string; message: string } | null,
}));

vi.mock('@/lib/app-session', () => ({
  getNovaAppSessionUserFromRequest: (...args: unknown[]) =>
    mocks.getUser(...args),
  getNovaPlatformRole: (...args: unknown[]) => mocks.getRole(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => {
    const client = {
      from: (table: string) => {
        const filters: string[] = [];
        const builder = {
          eq: (column: string) => {
            filters.push(column);
            return builder;
          },
          gte: () => {
            filters.push('created_at');
            return builder;
          },
          insert: (value: unknown) => {
            mocks.inserts.push(value);
            return builder;
          },
          limit: () => builder,
          order: () => builder,
          lt: () => builder,
          maybeSingle: async () =>
            table === 'nova_challenges'
              ? { data: mocks.challenge, error: null }
              : { data: null, error: null },
          select: (_columns?: unknown, _options?: unknown) => builder,
          single: async () => ({
            data: mocks.insertError
              ? null
              : { id: 'session-1', ...(mocks.inserts.at(-1) as object) },
            error: mocks.insertError,
          }),
          // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are intentionally thenable.
          then: (resolve: (value: unknown) => unknown) =>
            Promise.resolve({
              count: filters.includes('created_at')
                ? mocks.dailyAttempts
                : mocks.totalAttempts,
              error: null,
            }).then(resolve),
        };
        return builder;
      },
      schema: () => client,
    };
    return client;
  },
}));

const participantRole = {
  allow_challenge_management: false,
  allow_manage_all_challenges: false,
  allow_role_management: false,
  enabled: true,
};

function protectedChallenge(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    close_at: null,
    duration: 3600,
    id: CHALLENGE_ID,
    max_attempts: 3,
    max_daily_attempts: 2,
    open_at: null,
    password_hash: `scrypt$32768$8$1$${'A'.repeat(22)}$${'B'.repeat(43)}`,
    previewable_at: '2020-01-01T00:00:00.000Z',
    whitelisted_only: false,
    ...overrides,
  };
}

function startSession(cookie?: string) {
  return import('./route').then(({ POST }) =>
    POST(
      new Request('https://nova.test/api/v1/sessions', {
        body: JSON.stringify({
          challengeId: CHALLENGE_ID,
          endTime: '1900-01-01T00:00:00.000Z',
          startTime: '2999-01-01T00:00:00.000Z',
          status: 'ENDED',
        }),
        headers: cookie ? { cookie } : {},
        method: 'POST',
      })
    )
  );
}

function grantCookie(userId: string, challengeId = CHALLENGE_ID) {
  const { token } = createChallengeAccessGrant({
    challengeId,
    userId,
    ttlSeconds: 600,
  });
  return `${challengeAccessCookieName(CHALLENGE_ID)}=${token}`;
}

describe('Nova session creation for password-protected challenges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.inserts.length = 0;
    mocks.insertError = null;
    mocks.totalAttempts = 0;
    mocks.dailyAttempts = 0;
    mocks.challenge = protectedChallenge();
    mocks.getUser.mockReturnValue({ email: 'user@example.com', id: 'user-1' });
    mocks.getRole.mockResolvedValue(participantRole);
  });

  it('rejects a participant without the challenge grant', async () => {
    const response = await startSession();

    expect(response.status).toBe(403);
    expect(mocks.inserts).toEqual([]);
  });

  it('rejects the stored hash or a grant for another user or challenge', async () => {
    for (const cookie of [
      `${challengeAccessCookieName(CHALLENGE_ID)}=${'a'.repeat(64)}`,
      `token=${'a'.repeat(64)}`,
      grantCookie('user-2'),
      grantCookie('user-1', 'another-challenge'),
    ]) {
      expect((await startSession(cookie)).status).toBe(403);
    }
    expect(mocks.inserts).toEqual([]);
  });

  it('starts a session with a grant bound to this user and challenge', async () => {
    const before = Date.now();
    const response = await startSession(grantCookie('user-1'));
    const inserted = mocks.inserts.at(-1) as Record<string, unknown>;

    expect(response.status).toBe(201);
    expect(mocks.inserts).toEqual([
      expect.objectContaining({
        challenge_id: CHALLENGE_ID,
        end_time: null,
        status: 'IN_PROGRESS',
        user_id: 'user-1',
      }),
    ]);
    expect(
      new Date(String(inserted.start_time)).getTime()
    ).toBeGreaterThanOrEqual(before);
    expect(new Date(String(inserted.start_time)).getTime()).toBeLessThanOrEqual(
      Date.now()
    );
  });

  it('does not require a grant for unprotected challenges', async () => {
    mocks.challenge = protectedChallenge({ password_hash: null });

    expect((await startSession()).status).toBe(201);
  });

  it('returns 409 when a concurrent start wins the database guard', async () => {
    mocks.challenge = protectedChallenge({ password_hash: null });
    mocks.insertError = {
      code: '23505',
      message: 'An active challenge session already exists',
    };
    const response = await startSession();
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      message: 'An active challenge session already exists',
    });
    expect(mocks.inserts).toHaveLength(1);
  });

  it('rejects challenges outside the participant catalog', async () => {
    mocks.challenge = protectedChallenge({ enabled: false });
    expect((await startSession(grantCookie('user-1'))).status).toBe(403);

    mocks.challenge = null;
    expect((await startSession(grantCookie('user-1'))).status).toBe(404);
    expect(mocks.inserts).toEqual([]);
  });

  it('lets challenge managers start sessions without the grant', async () => {
    mocks.getRole.mockResolvedValue({
      ...participantRole,
      allow_challenge_management: true,
      allow_manage_all_challenges: true,
    });

    expect((await startSession()).status).toBe(201);
  });

  it('rejects participants outside the open and close window', async () => {
    mocks.challenge = protectedChallenge({
      previewable_at: new Date(Date.now() + 60_000).toISOString(),
      password_hash: null,
    });
    expect((await startSession()).status).toBe(403);

    mocks.challenge = protectedChallenge({
      open_at: new Date(Date.now() + 60_000).toISOString(),
      password_hash: null,
    });
    expect((await startSession()).status).toBe(403);

    mocks.challenge = protectedChallenge({
      close_at: new Date(Date.now() - 60_000).toISOString(),
      password_hash: null,
    });
    expect((await startSession()).status).toBe(403);
    expect(mocks.inserts).toEqual([]);
  });

  it('rejects participants who reached either attempt limit', async () => {
    mocks.challenge = protectedChallenge({
      max_attempts: 1,
      password_hash: null,
    });
    mocks.totalAttempts = 1;
    expect((await startSession()).status).toBe(403);

    mocks.challenge = protectedChallenge({
      max_attempts: 5,
      max_daily_attempts: 1,
      password_hash: null,
    });
    mocks.totalAttempts = 0;
    mocks.dailyAttempts = 1;
    expect((await startSession()).status).toBe(403);
    expect(mocks.inserts).toEqual([]);
  });
});
