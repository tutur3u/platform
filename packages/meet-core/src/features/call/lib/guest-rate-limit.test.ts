import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkMeetGuestJoinLimit,
  MEET_GUEST_JOIN_LIMIT,
  MEET_GUEST_JOIN_LIMIT_ENV,
  MEET_GUEST_JOIN_NETWORK_LIMIT,
  MEET_GUEST_JOIN_NETWORK_LIMIT_ENV,
  MEET_GUEST_JOIN_NETWORK_WINDOW_MS,
  MEET_GUEST_JOIN_WINDOW_MS,
  meetEventGuestJoinLimit,
  meetGuestJoinLimits,
  meetGuestJoinWindows,
  resetMeetGuestJoinLimiter,
} from './guest-rate-limit';

const meetingId = '7f2a528e-3bff-40ee-bfda-5b944ad03ed8';

describe('meet guest join limit', () => {
  beforeEach(() => resetMeetGuestJoinLimiter());
  afterEach(() => vi.unstubAllEnvs());

  it('charges a per-meeting and a cross-meeting window per network', () => {
    expect(meetGuestJoinWindows(meetingId, '203.0.113.4')).toEqual([
      {
        partition: 'meet-guest-ip:203.0.113.4',
        windows: [
          {
            key: `join:${meetingId}:10m`,
            limit: 200,
            windowMs: 600_000,
            algo: 'fixed',
          },
          {
            key: 'join:all-meetings:1h',
            limit: 400,
            windowMs: 3_600_000,
            algo: 'fixed',
          },
        ],
      },
    ]);
  });

  it('caps new event sessions at 150 per network and room, including repeated joins', async () => {
    vi.stubEnv('MEET_EVENT_GUEST_JOIN_LIMIT', '');
    const input = { meetingId, eventLimit: meetEventGuestJoinLimit() };
    const at = () => 60_000;
    for (let attempt = 0; attempt < 150; attempt++) {
      const network = attempt % 2 ? '2001:db8:aa:bb::1' : '2001:db8:aa:bb::2';
      expect(
        await checkMeetGuestJoinLimit({ ...input, network }, null, at)
      ).toEqual({ ok: true });
    }
    const sameNetwork = { ...input, network: '2001:db8:aa:bb::3' };
    expect((await checkMeetGuestJoinLimit(sameNetwork, null, at)).ok).toBe(
      false
    );
    expect(
      (
        await checkMeetGuestJoinLimit(
          { ...sameNetwork, network: '2001:db8:aa:bc::1' },
          null,
          at
        )
      ).ok
    ).toBe(true);
    expect(
      (
        await checkMeetGuestJoinLimit(
          { ...sameNetwork, eventLimit: undefined },
          null,
          at
        )
      ).ok
    ).toBe(true);
    vi.stubEnv('MEET_EVENT_GUEST_JOIN_LIMIT', '175');
    expect(meetEventGuestJoinLimit()).toBe(175);
  });

  it('supports 50 venue guests, each with a failed provider attempt, plus retry headroom', async () => {
    const input = { meetingId, network: '203.0.113.4' };
    const event = { ...input, eventLimit: 80 };
    const at = () => 60_000;
    for (let i = 0; i < 50; i++) {
      expect((await checkMeetGuestJoinLimit(input, null, at)).ok).toBe(true);
      expect(
        (await checkMeetGuestJoinLimit({ ...event, phase: 'verify' }, null, at))
          .ok
      ).toBe(true);
      expect((await checkMeetGuestJoinLimit(input, null, at)).ok).toBe(true);
      expect(
        (
          await checkMeetGuestJoinLimit(
            { ...event, phase: 'challenge' },
            null,
            at
          )
        ).ok
      ).toBe(true);
      expect((await checkMeetGuestJoinLimit(input, null, at)).ok).toBe(true);
      expect(
        (await checkMeetGuestJoinLimit({ ...event, phase: 'work' }, null, at))
          .ok
      ).toBe(true);
      expect((await checkMeetGuestJoinLimit(event, null, at)).ok).toBe(true);
    }
    for (let i = 0; i < 30; i++) {
      expect((await checkMeetGuestJoinLimit(input, null, at)).ok).toBe(true);
      expect(
        (await checkMeetGuestJoinLimit({ ...event, phase: 'work' }, null, at))
          .ok
      ).toBe(true);
    }
    expect(
      (await checkMeetGuestJoinLimit({ ...event, phase: 'work' }, null, at)).ok
    ).toBe(false);
    expect(
      (
        await checkMeetGuestJoinLimit(
          { ...event, phase: 'work', meetingId: 'other' },
          null,
          at
        )
      ).ok
    ).toBe(true);
  });

  it('fails closed when an event requires a shared store', async () => {
    expect(
      (
        await checkMeetGuestJoinLimit(
          {
            meetingId,
            network: '203.0.113.4',
            eventLimit: 80,
            requireSharedStore: true,
          },
          null
        )
      ).ok
    ).toBe(false);
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

  // Local counting applies the same windows as the store, so it shows the
  // limits themselves. Joins run one second apart inside one fixed window.
  const start = 2 * MEET_GUEST_JOIN_NETWORK_WINDOW_MS;
  const join = (meeting: string, at: number, network = '203.0.113.4') =>
    checkMeetGuestJoinLimit({ meetingId: meeting, network }, null, () => at);

  it('lets a class of 50 behind one IP join in a burst with retries', async () => {
    // 50 guests in three minutes; about one in five tries again (a failed
    // Turnstile check or a reconnect after the phone locked).
    const attempts = 50 + 10;
    for (let attempt = 0; attempt < attempts; attempt++)
      await expect(
        join(meetingId, start + Math.floor((attempt * 180_000) / attempts))
      ).resolves.toEqual({ ok: true });
  });

  it('refuses the join after the limit in the same meeting and window', async () => {
    expect(MEET_GUEST_JOIN_LIMIT).toBe(200);
    for (let guest = 0; guest < MEET_GUEST_JOIN_LIMIT; guest++)
      await expect(join(meetingId, start + guest * 1000)).resolves.toEqual({
        ok: true,
      });
    const after = start + MEET_GUEST_JOIN_LIMIT * 1000;
    await expect(join(meetingId, after)).resolves.toMatchObject({
      ok: false,
    });
    // Another meeting from the same IP still has room.
    await expect(
      join('6c0e63bb-0a3d-4c43-9a3e-1d3b1f2a9e10', after + 1000)
    ).resolves.toEqual({ ok: true });
    // The next ten-minute window opens again.
    await expect(
      join(meetingId, start + MEET_GUEST_JOIN_WINDOW_MS)
    ).resolves.toEqual({ ok: true });
  });

  it('holds the cross-meeting ceiling for one IP across many meetings', async () => {
    let at = start;
    // Two rooms at their ten-minute limit use the whole hour's ceiling.
    expect(MEET_GUEST_JOIN_NETWORK_LIMIT).toBe(400);
    const perRoom = MEET_GUEST_JOIN_NETWORK_LIMIT / 2;
    for (let room = 0; room < 2; room++)
      for (let guest = 0; guest < perRoom; guest++)
        await expect(join(`room-${room}`, (at += 1000))).resolves.toEqual({
          ok: true,
        });
    // The 401st join in the hour, in a meeting with room to spare.
    const refused = await join('room-3', (at += 1000));
    expect(refused).toMatchObject({ ok: false });
    // Until the hour ends.
    expect(refused.ok ? 0 : refused.retryAfterSeconds).toBeGreaterThan(
      MEET_GUEST_JOIN_WINDOW_MS / 1000
    );
    // Another IP is not affected.
    await expect(join('room-3', at, '198.51.100.7')).resolves.toEqual({
      ok: true,
    });
  });

  it('takes a positive override and ignores a bad one', () => {
    vi.stubEnv(MEET_GUEST_JOIN_LIMIT_ENV, '80');
    vi.stubEnv(MEET_GUEST_JOIN_NETWORK_LIMIT_ENV, '200');
    expect(meetGuestJoinLimits()).toEqual({ meeting: 80, network: 200 });
    for (const bad of ['0', '-5', 'many', '12abc', '']) {
      vi.stubEnv(MEET_GUEST_JOIN_LIMIT_ENV, bad);
      expect(meetGuestJoinLimits().meeting).toBe(MEET_GUEST_JOIN_LIMIT);
    }
  });

  it('counts an IPv6 network as its /64', async () => {
    const at = start;
    for (let guest = 0; guest < MEET_GUEST_JOIN_LIMIT; guest++)
      await expect(
        join(meetingId, at + guest, `2001:db8:aa:bb::${guest.toString(16)}`)
      ).resolves.toEqual({ ok: true });
    await expect(
      join(meetingId, at + 100, '2001:db8:aa:bb:ffff::1')
    ).resolves.toMatchObject({ ok: false });
    await expect(
      join(meetingId, at + 101, '2001:db8:aa:bc::1')
    ).resolves.toEqual({ ok: true });
    // The shared store is charged under the /64 too.
    const limiter = {
      hitWindows: vi.fn().mockResolvedValue({
        ok: true,
        resetAt: 0,
        subjectIndex: -1,
        windows: [],
      }),
    };
    await checkMeetGuestJoinLimit(
      { meetingId, network: '2001:db8:aa:bb::1' },
      limiter
    );
    expect(limiter.hitWindows.mock.calls[0]?.[0][0].partition).toBe(
      'meet-guest-ip:2001:db8:aa:bb::/64'
    );
  });
});
