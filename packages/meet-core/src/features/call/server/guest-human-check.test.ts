import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../meeting-ai/server/usage-limit', () => ({
  meetAiUsageGuard: vi.fn(),
}));

import {
  chargeMeetHumanCheck,
  chargeMeetHumanCheckPlacement,
  MEET_HUMAN_CHECK_PLACEMENT_LIMIT,
  MEET_HUMAN_CHECK_NETWORK_LIMIT,
  meetHumanCheckSecret,
  meetHumanCheckStore,
  resetMeetHumanCheckIssuance,
} from './guest-human-check';

const meetingId = '7f2a528e-3bff-40ee-bfda-5b944ad03ed8';

describe('chargeMeetHumanCheck', () => {
  beforeEach(() => resetMeetHumanCheckIssuance());

  it('escalates after half the budget and then cools down', async () => {
    const levels: number[] = [];
    for (let i = 0; i < MEET_HUMAN_CHECK_NETWORK_LIMIT; i += 1) {
      const result = await chargeMeetHumanCheck(
        { meetingId, network: '203.0.113.4' },
        null
      );
      if (!result.ok) throw new Error('unexpected refusal');
      levels.push(result.level);
    }
    expect(levels).toEqual([0, 0, 0, 1, 1, 1]);
    expect(
      await chargeMeetHumanCheck({ meetingId, network: '203.0.113.4' }, null)
    ).toMatchObject({ ok: false });
  });

  it('follows the shared store and derives the level from its remaining budget', async () => {
    const guard = {
      hitWindows: vi.fn().mockResolvedValue({
        ok: true,
        remaining: 1,
        resetAt: 0,
        windows: [{ remaining: 1 }],
      }),
    };
    expect(
      await chargeMeetHumanCheck({ meetingId, network: 'n' }, guard as never)
    ).toEqual({ ok: true, level: 1 });
    guard.hitWindows.mockResolvedValue({
      ok: false,
      resetAt: 31_000,
      subjectIndex: 0,
      windows: [],
    });
    expect(
      await chargeMeetHumanCheck(
        { meetingId, network: 'n' },
        guard as never,
        () => 1_000
      )
    ).toEqual({
      ok: false,
      retryAfterSeconds: 30,
    });
  });
});

describe('chargeMeetHumanCheckPlacement', () => {
  beforeEach(() => resetMeetHumanCheckIssuance());

  it('caps placements per network across meetings', async () => {
    for (let i = 0; i < MEET_HUMAN_CHECK_PLACEMENT_LIMIT; i += 1)
      expect(await chargeMeetHumanCheckPlacement('203.0.113.9', null)).toEqual({
        ok: true,
      });
    expect(
      await chargeMeetHumanCheckPlacement('203.0.113.9', null)
    ).toMatchObject({ ok: false });
    expect(await chargeMeetHumanCheckPlacement('198.51.100.1', null)).toEqual({
      ok: true,
    });
  });
});

describe('meetHumanCheckSecret', () => {
  it('requires a long secret', () => {
    vi.stubEnv('HUMAN_CHECK_SECRET', 'short');
    expect(meetHumanCheckSecret()).toBeNull();
    vi.stubEnv('HUMAN_CHECK_SECRET', 'x'.repeat(43));
    expect(meetHumanCheckSecret()).toBe('x'.repeat(43));
    vi.unstubAllEnvs();
  });
});

describe('meetHumanCheckStore', () => {
  it('uses the shared counter and falls back locally when it fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const guard = {
      hitWindows: vi.fn(),
      incr: vi.fn().mockResolvedValue({ n: 2 }),
    };
    const store = meetHumanCheckStore(guard);
    expect(await store.incr('k', 5000)).toBe(2);
    expect(guard.incr).toHaveBeenCalledWith('k', 1, 5000);
    guard.incr.mockRejectedValue(new Error('down'));
    expect(await store.incr('fallback-key', 5000)).toBe(1);
    warn.mockRestore();
  });
});
