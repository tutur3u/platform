import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hasActiveNovaChallengeSession } from './challenge-catalog-access';

const mocks = vi.hoisted(() => ({
  sessions: [] as Array<{ start_time: string }>,
  closeAt: null as string | null,
}));
vi.mock('@/lib/app-session', () => ({ getNovaPlatformRole: vi.fn() }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => {
    const client = {
      schema: () => client,
      from: (table: string) => {
        let ordered = false;
        const builder = {
          select: () => builder,
          eq: () => builder,
          limit: () => builder,
          order: (column: string, options: { ascending: boolean }) => {
            ordered = column === 'start_time' && !options.ascending;
            return builder;
          },
          maybeSingle: async () => ({
            data:
              table === 'nova_challenges'
                ? { duration: 3600, close_at: mocks.closeAt }
                : ((ordered
                    ? [...mocks.sessions].sort((a, b) =>
                        b.start_time.localeCompare(a.start_time)
                      )
                    : mocks.sessions)[0] ?? null),
            error: null,
          }),
        };
        return builder;
      },
    };
    return client;
  },
}));
const check = async () =>
  hasActiveNovaChallengeSession({
    challengeId: 'challenge-1',
    userId: 'user-1',
    now: new Date('2026-10-25T03:30:00.000Z'),
    sbAdmin: await createAdminClient({ noCookie: true }),
  });
beforeEach(() => {
  mocks.sessions = [];
  mocks.closeAt = null;
});
describe('Nova active session lookup', () => {
  it('uses the newest session when an older IN_PROGRESS row has expired', async () => {
    mocks.sessions = [
      { start_time: '2026-10-25T01:00:00.000Z' },
      { start_time: '2026-10-25T03:00:00.000Z' },
    ];
    expect(await check()).toBe(true);
  });
  it('rejects duration expiry before cleanup', async () => {
    mocks.sessions = [{ start_time: '2026-10-25T02:30:00.000Z' }];
    expect(await check()).toBe(false);
  });
  it('rejects close-time expiry before cleanup', async () => {
    mocks.sessions = [{ start_time: '2026-10-25T03:00:00.000Z' }];
    mocks.closeAt = '2026-10-25T03:30:00.000Z';
    expect(await check()).toBe(false);
  });
});
