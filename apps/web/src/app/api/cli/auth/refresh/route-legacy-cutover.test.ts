import { createCliAppSession } from '@tuturuuu/auth/cli-session';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  storeGet: vi.fn(),
  storeSet: vi.fn(),
  legacyGet: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/app-coordination/session-policy', () => ({
  getCliAppSessionPolicy: vi.fn().mockResolvedValue({
    cliAccessTtlSeconds: 28_800,
    cliRefreshTtlSeconds: 7_776_000,
  }),
}));

// The replay family is assigned to the guard store; the real upstash-rest
// module decides whether the legacy store must be read through.
vi.mock('@tuturuuu/utils/abuse-guard/select', () => ({
  isAbuseGuardFamilyAssigned: () => true,
  selectAbuseGuard: () => ({
    kind: 'durable-object',
    client: { get: mocks.storeGet, set: mocks.storeSet },
  }),
}));

vi.mock('@upstash/redis', () => ({
  Redis: {
    fromEnv: () => ({ get: mocks.legacyGet, scan: () => undefined }),
  },
}));

function refresh(refreshToken: string) {
  return POST(
    new NextRequest('https://tuturuuu.com/api/cli/auth/refresh', {
      body: JSON.stringify({ refreshToken }),
      method: 'POST',
    })
  );
}

describe('CLI refresh across the replay-store cutover', () => {
  let userIndex = 0;
  const freshToken = () => {
    userIndex += 1;
    return createCliAppSession({
      email: 'agent@example.com',
      userId: `cutover-user-${userIndex}`,
    }).refresh.token;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-secret');
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.test');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'synthetic');
    vi.stubEnv('ABUSE_GUARD_REPLAY_LEGACY_UNTIL', '2999-01-01T00:00:00Z');
    // The token was consumed in the legacy store before the cutover.
    mocks.legacyGet.mockResolvedValue('1');
    mocks.storeGet.mockResolvedValue(null);
    mocks.storeSet.mockResolvedValue(true);
    vi.mocked(createAdminClient).mockResolvedValue({
      auth: {
        admin: {
          getUserById: vi.fn().mockResolvedValue({
            data: { user: { email: 'agent@example.com', id: 'user' } },
            error: null,
          }),
        },
      },
    } as never);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('rejects a token consumed in the legacy store', async () => {
    expect((await refresh(freshToken())).status).toBe(401);
    expect(mocks.storeSet).not.toHaveBeenCalled();
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it.each([
    ['token', 'UPSTASH_REDIS_REST_TOKEN'],
    ['URL', 'UPSTASH_REDIS_REST_URL'],
  ])(
    'fails closed when the legacy %s disappears mid-cutover',
    async (_, name) => {
      vi.stubEnv(name, '');
      expect((await refresh(freshToken())).status).toBe(503);
      expect(mocks.storeSet).not.toHaveBeenCalled();
      expect(createAdminClient).not.toHaveBeenCalled();
    }
  );

  it('fails closed for a malformed cutover deadline', async () => {
    vi.stubEnv('ABUSE_GUARD_REPLAY_LEGACY_UNTIL', 'next quarter');
    expect((await refresh(freshToken())).status).toBe(503);
    expect(mocks.storeSet).not.toHaveBeenCalled();
  });

  it('uses only the new store after the cutover window', async () => {
    vi.stubEnv('ABUSE_GUARD_REPLAY_LEGACY_UNTIL', '2000-01-01T00:00:00Z');
    expect((await refresh(freshToken())).status).toBe(200);
    expect(mocks.legacyGet).not.toHaveBeenCalled();
    expect(mocks.storeSet).toHaveBeenCalledTimes(1);
  });
});
