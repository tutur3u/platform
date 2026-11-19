import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkMeetGuestJoinLimit,
  MEET_GUEST_JOIN_LIMIT,
  meetGuestJoinWindows,
  resetMeetGuestJoinLimiter,
} from './guest-rate-limit';

const meetingId = '7f2a528e-3bff-40ee-bfda-5b944ad03ed8';

describe('meet guest join limit', () => {
  beforeEach(() => resetMeetGuestJoinLimiter());

  it('charges one window per network and meeting', () => {
    expect(meetGuestJoinWindows(meetingId, '203.0.113.4')).toEqual([
      {
        partition: 'meet-guest-ip:203.0.113.4',
        windows: [
          {
            key: `join:${meetingId}:10m`,
            limit: 5,
            windowMs: 600_000,
            algo: 'fixed',
          },
        ],
      },
    ]);
  });

  it('follows the shared store decision', async () => {
    const limiter = {
      hitWindows: vi.fn().mockResolvedValue({
        ok: false,
        resetAt: 61_000,
        subjectIndex: 0,
        windows: [],
      }),
    };
    await expect(
      checkMeetGuestJoinLimit(
        { meetingId, network: '203.0.113.4' },
        limiter,
        () => 1_000
      )
    ).resolves.toEqual({ ok: false, retryAfterSeconds: 60 });
  });

  it('counts locally when the store is unavailable instead of allowing freely', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const limiter = {
      hitWindows: vi.fn().mockRejectedValue(new Error('down')),
    };
    for (let attempt = 0; attempt < MEET_GUEST_JOIN_LIMIT; attempt++)
      await expect(
        checkMeetGuestJoinLimit({ meetingId, network: '203.0.113.4' }, limiter)
      ).resolves.toEqual({ ok: true });
    await expect(
      checkMeetGuestJoinLimit({ meetingId, network: '203.0.113.4' }, limiter)
    ).resolves.toMatchObject({ ok: false });
    await expect(
      checkMeetGuestJoinLimit({ meetingId, network: '198.51.100.7' }, null)
    ).resolves.toEqual({ ok: true });
    warn.mockRestore();
  });
});
