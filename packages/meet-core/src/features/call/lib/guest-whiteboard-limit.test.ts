import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkMeetGuestWhiteboardLimit,
  MEET_GUEST_WHITEBOARD_LIMIT,
  meetGuestWhiteboardWindows,
  resetMeetGuestWhiteboardLimiter,
} from './guest-whiteboard-limit';

const meetingId = '7f2a528e-3bff-40ee-bfda-5b944ad03ed8';
const guestId = 'guest-1';

describe('meet guest whiteboard limit', () => {
  beforeEach(() => resetMeetGuestWhiteboardLimiter());

  it('charges one window per guest and meeting', () => {
    expect(meetGuestWhiteboardWindows(meetingId, guestId)).toEqual([
      {
        partition: 'meet-guest-board:guest-1',
        windows: [
          {
            key: `board:${meetingId}:1m`,
            limit: 30,
            windowMs: 60_000,
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
        resetAt: 31_000,
        subjectIndex: 0,
        windows: [],
      }),
    };
    await expect(
      checkMeetGuestWhiteboardLimit({ meetingId, guestId }, limiter, () => 1000)
    ).resolves.toEqual({ ok: false, retryAfterSeconds: 30 });
  });

  it('counts locally in a fixed window when the store is down', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const limiter = { hitWindows: vi.fn().mockRejectedValue(new Error('x')) };
    let now = 0;
    const clock = () => now;
    for (let call = 0; call < MEET_GUEST_WHITEBOARD_LIMIT; call++) {
      now += 1000;
      await expect(
        checkMeetGuestWhiteboardLimit({ meetingId, guestId }, limiter, clock)
      ).resolves.toEqual({ ok: true });
    }
    await expect(
      checkMeetGuestWhiteboardLimit({ meetingId, guestId }, limiter, clock)
    ).resolves.toMatchObject({ ok: false });
    // Another guest and another meeting have their own windows.
    await expect(
      checkMeetGuestWhiteboardLimit({ meetingId, guestId: 'guest-2' }, null)
    ).resolves.toEqual({ ok: true });
    // The window resets a minute after its first call.
    now = 61_001;
    await expect(
      checkMeetGuestWhiteboardLimit({ meetingId, guestId }, null, clock)
    ).resolves.toEqual({ ok: true });
    warn.mockRestore();
  });
});
