import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkMeetGuestUnverifiedLimit,
  MEET_GUEST_UNVERIFIED_NETWORK_LIMIT,
  MEET_GUEST_UNVERIFIED_ROOM_LIMIT,
  meetGuestUnverifiedWindows,
  resetMeetGuestUnverifiedLimiter,
} from './guest-unverified-limit';

const meetingId = '7f2a528e-3bff-40ee-bfda-5b944ad03ed8';

describe('meet unverified guest limit', () => {
  beforeEach(() => resetMeetGuestUnverifiedLimiter());

  it('charges a network window and a room-wide window', () => {
    const windows = meetGuestUnverifiedWindows(meetingId, '203.0.113.4', 2);
    expect(windows.map((subject) => subject.partition)).toEqual([
      'meet-guest-unverified-ip:203.0.113.4',
      `meet-guest-unverified-room:${meetingId}`,
    ]);
    expect(windows[0]?.windows[0]?.limit).toBe(2);
    expect(windows[1]?.windows[0]?.limit).toBe(
      MEET_GUEST_UNVERIFIED_ROOM_LIMIT
    );
  });

  it('never raises the network budget above the base limit', async () => {
    const limiter = {
      hitWindows: vi.fn().mockResolvedValue({
        ok: true,
        remaining: 1,
        resetAt: 0,
        windows: [],
      }),
    };
    await checkMeetGuestUnverifiedLimit(
      { meetingId, network: '203.0.113.4', networkLimit: 50 },
      limiter
    );
    expect(limiter.hitWindows.mock.calls[0]?.[0][0].windows[0].limit).toBe(
      MEET_GUEST_UNVERIFIED_NETWORK_LIMIT
    );
  });

  it('follows the shared store refusal', async () => {
    const limiter = {
      hitWindows: vi.fn().mockResolvedValue({
        ok: false,
        resetAt: 61_000,
        subjectIndex: 1,
        windows: [],
      }),
    };
    await expect(
      checkMeetGuestUnverifiedLimit(
        { meetingId, network: '203.0.113.4' },
        limiter,
        () => 1_000
      )
    ).resolves.toEqual({ ok: false, retryAfterSeconds: 60 });
  });

  it('counts locally when the shared store fails, per network and per room', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failing = { hitWindows: vi.fn().mockRejectedValue(new Error('x')) };
    for (let i = 0; i < 2; i += 1)
      await expect(
        checkMeetGuestUnverifiedLimit(
          { meetingId, network: '198.51.100.1', networkLimit: 2 },
          failing
        )
      ).resolves.toEqual({ ok: true });
    await expect(
      checkMeetGuestUnverifiedLimit(
        { meetingId, network: '198.51.100.1', networkLimit: 2 },
        failing
      )
    ).resolves.toMatchObject({ ok: false });
    for (let i = 2; i < MEET_GUEST_UNVERIFIED_ROOM_LIMIT; i += 1)
      await checkMeetGuestUnverifiedLimit(
        { meetingId, network: `198.51.100.${i + 10}` },
        null
      );
    await expect(
      checkMeetGuestUnverifiedLimit({ meetingId, network: '192.0.2.200' }, null)
    ).resolves.toMatchObject({ ok: false });
    warn.mockRestore();
  });
});
