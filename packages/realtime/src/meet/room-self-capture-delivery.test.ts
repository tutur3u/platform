import { describe, expect, it, vi } from 'vitest';
import {
  runSelfOutboxDelivery,
  SELF_OUTBOX_DAILY_DELIVERIES,
  SELF_OUTBOX_MAX_DELIVERIES,
  selectSelfOutboxBatch,
  selfOutboxDeadline,
} from './room-self-capture-delivery';
import type { RoomServiceState } from './room-service';
import { releaseParticipant } from './index';
import {
  revokeSelfCapture,
  settleSelfCapture,
} from './room-self-capture-state';
import {
  alice,
  bob,
  open,
  selfRoom,
  streamA,
  streamB,
} from './room-self-capture.fixtures';
import { verifyMeetSelfOutboxCredential } from './service-credential';

const T = 1_000_000;
const secret = 'test-secret';

function pendingRoom() {
  const opened = open(selfRoom(), alice, streamA);
  return settleSelfCapture(
    releaseParticipant(opened, alice, 'room', new Date(T).toISOString()).state,
    T
  ) as RoomServiceState;
}

function harness(
  state: RoomServiceState,
  reply: (request: Request) => Promise<Response>
) {
  let current = state;
  let clock = T;
  const writes: RoomServiceState[] = [];
  const fetch = vi.fn(async (request: Request) => {
    expect(request.url).toBe('https://meet.internal/api/meet-ai/self/outbox');
    const token = request.headers.get('Authorization')!.slice('Bearer '.length);
    expect(verifyMeetSelfOutboxCredential(token, secret, clock)).toMatchObject({
      purpose: 'self-outbox',
      roomId: 'room-1',
    });
    return reply(request);
  });
  const run = (
    now: number,
    env: object = { MEET_AI_SELF_OUTBOX: { fetch } }
  ) => {
    clock = now;
    return runSelfOutboxDelivery({
      env,
      secret,
      roomName: 'room-1',
      now,
      read: () => current,
      commit: async (next) => {
        current = next;
        writes.push(next);
      },
    });
  };
  return {
    fetch,
    run,
    writes,
    read: () => current,
    set: (next: RoomServiceState) => void (current = next),
  };
}

describe('per-speaker outbox alarm delivery', () => {
  it('does nothing without the binding', async () => {
    const state = pendingRoom();
    expect(state.selfCapture?.outbox).toHaveLength(1);
    expect(selfOutboxDeadline(state, {})).toBeUndefined();
    const h = harness(state, async () => Response.json({ acked: [] }));
    await h.run(T + 60_000, {});
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.writes).toHaveLength(0);
  });

  it('delivers once due and removes the acknowledged entries', async () => {
    const state = pendingRoom();
    const env = { MEET_AI_SELF_OUTBOX: { fetch: async () => new Response() } };
    expect(selfOutboxDeadline(state, env)).toBe(T + 10_000);
    const [entry] = state.selfCapture!.outbox;
    const h = harness(state, async () =>
      Response.json({
        acked: [
          {
            sessionId: entry!.sessionId,
            accountId: entry!.accountId,
            seq: entry!.seq,
          },
        ],
      })
    );
    await h.run(T + 5_000);
    expect(h.fetch).not.toHaveBeenCalled();
    await h.run(T + 10_000);
    expect(h.fetch).toHaveBeenCalledTimes(1);
    // The attempt is stored before the send.
    expect(h.writes[0]?.selfCapture?.delivery).toEqual({
      attempts: 1,
      nextAt: T + 30_000,
      startedAt: T,
    });
    expect(h.read().selfCapture?.outbox).toEqual([]);
    expect(h.read().selfCapture?.delivery).toBeUndefined();
    expect(selfOutboxDeadline(h.read(), env)).toBeUndefined();
  });

  it('backs off six times, then retries hourly for at most 24 hours', async () => {
    const h = harness(
      pendingRoom(),
      async () => new Response(null, { status: 503 })
    );
    const sends: number[] = [];
    const step = async (now: number) => {
      const before = h.fetch.mock.calls.length;
      await h.run(now);
      if (h.fetch.mock.calls.length > before) sends.push(now - T);
    };
    for (let now = T; now <= T + 700_000; now += 10_000) await step(now);
    expect(sends).toEqual([10_000, 30_000, 70_000, 150_000, 310_000, 630_000]);
    expect(h.fetch).toHaveBeenCalledTimes(SELF_OUTBOX_MAX_DELIVERIES);
    for (let now = T + 1_200_000; now <= T + 30 * 3_600_000; now += 600_000)
      await step(now);
    const slow = sends.slice(6);
    expect(slow.length).toBeGreaterThanOrEqual(20);
    for (let i = 1; i < slow.length; i++)
      expect(slow[i]! - slow[i - 1]!).toBeGreaterThanOrEqual(3_600_000);
    expect(slow.at(-1)!).toBeLessThanOrEqual(24 * 3_600_000);
    expect(h.read().selfCapture?.outbox).toHaveLength(1);
    expect(
      selfOutboxDeadline(h.read(), { MEET_AI_SELF_OUTBOX: { fetch: h.fetch } })
    ).toBeUndefined();
    expect(h.read().selfCapture?.delivery?.failures?.[alice]).toBe(
      sends.length
    );
  });

  it('a new ending restarts an exhausted cycle', () => {
    const state = pendingRoom();
    const exhausted: RoomServiceState = {
      ...state,
      selfCapture: {
        ...state.selfCapture!,
        delivery: { attempts: 30, startedAt: T, nextAt: T + 25 * 3_600_000 },
      },
    };
    const env = { MEET_AI_SELF_OUTBOX: { fetch: async () => new Response() } };
    expect(selfOutboxDeadline(exhausted, env)).toBeUndefined();
    const later = T + 26 * 3_600_000;
    const revoked = revokeSelfCapture(
      {
        ...exhausted,
        selfCapture: {
          ...exhausted.selfCapture!,
          session: { ...exhausted.selfCapture!.session!, status: 'active' },
        },
      },
      alice,
      later
    );
    expect(revoked.selfCapture?.outbox.map((e) => e.kind)).toEqual(['revoke']);
    expect(revoked.selfCapture?.delivery).toMatchObject({
      attempts: 0,
      startedAt: later,
    });
    expect(selfOutboxDeadline(revoked, env)).toBe(later + 10_000);
  });

  it('one failing account never blocks another', async () => {
    let state = open(pendingRoom(), bob, streamB);
    state = settleSelfCapture(
      releaseParticipant(state, bob, 'room', new Date(T).toISOString()).state,
      T
    ) as RoomServiceState;
    const [aliceEntry, bobEntry] = state.selfCapture!.outbox;
    expect([aliceEntry?.accountId, bobEntry?.accountId]).toEqual([alice, bob]);
    // The Meet Worker applies Bob's entry; Alice's keeps failing.
    const h = harness(state, async () => Response.json({ acked: [bobEntry] }));
    await h.run(T + 10_000);
    expect(h.read().selfCapture?.outbox).toEqual([aliceEntry]);
    expect(h.read().selfCapture?.delivery?.failures).toEqual({ [alice]: 1 });
    // Progress restarted the cycle.
    expect(h.read().selfCapture?.delivery).toMatchObject({ attempts: 0 });
    // The account that failed most is sent last.
    const crowded: RoomServiceState = {
      ...h.read(),
      selfCapture: {
        ...h.read().selfCapture!,
        outbox: [aliceEntry!, { ...bobEntry!, seq: 99 }],
      },
    };
    expect(
      selectSelfOutboxBatch(crowded.selfCapture!).map((e) => e.accountId)
    ).toEqual([bob, alice]);
  });

  it('applies acknowledgements to the state current after the send', async () => {
    const state = pendingRoom();
    const [entry] = state.selfCapture!.outbox;
    const box: { h?: ReturnType<typeof harness> } = {};
    box.h = harness(state, async () => {
      // Another request changes the room while the delivery is in flight.
      box.h!.set({ ...box.h!.read(), roomName: 'changed' });
      return Response.json({
        acked: [
          { sessionId: entry!.sessionId, accountId: alice, seq: entry!.seq },
        ],
      });
    });
    await box.h.run(T + 10_000);
    expect(box.h.read().roomName).toBe('changed');
    expect(box.h.read().selfCapture?.outbox).toEqual([]);
  });
});

describe('outbox delivery bounds', () => {
  it('sends at most the daily cap per room, whatever the cycles allow', async () => {
    const base = pendingRoom();
    const [first] = base.selfCapture!.outbox;
    const outbox = Array.from({ length: 2000 }, (_, i) => ({
      ...first!,
      seq: 100 + i,
    }));
    const state: RoomServiceState = {
      ...base,
      selfCapture: { ...base.selfCapture!, outbox },
    };
    // Every delivery acknowledges one entry, so each restarts the cycle.
    const h = harness(state, async (request) => {
      const body = (await request.json()) as {
        entries: { sessionId: string; accountId: string; seq: number }[];
      };
      return Response.json({ acked: body.entries.slice(0, 1) });
    });
    const day = 86_400_000;
    for (let now = T; now < day; now += 10_000) await h.run(now);
    expect(h.fetch).toHaveBeenCalledTimes(SELF_OUTBOX_DAILY_DELIVERIES);
    expect(h.read().selfCapture?.deliveryDay).toEqual({
      day: 0,
      count: SELF_OUTBOX_DAILY_DELIVERIES,
    });
    const env = { MEET_AI_SELF_OUTBOX: { fetch: h.fetch } };
    expect(selfOutboxDeadline(h.read(), env)).toBe(day);
    await h.run(day);
    expect(h.fetch).toHaveBeenCalledTimes(SELF_OUTBOX_DAILY_DELIVERIES + 1);
  });

  it('logs an error when the retry window ends with entries left', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const base = pendingRoom();
      const last = T + 24 * 3_600_000 - 1000;
      const state: RoomServiceState = {
        ...base,
        selfCapture: {
          ...base.selfCapture!,
          delivery: { attempts: 20, startedAt: T, nextAt: last },
        },
      };
      const h = harness(state, async () => new Response(null, { status: 503 }));
      await h.run(last);
      expect(h.fetch).toHaveBeenCalledTimes(1);
      expect(error).toHaveBeenCalledTimes(1);
      expect(
        selfOutboxDeadline(h.read(), { MEET_AI_SELF_OUTBOX: { fetch: h.fetch } })
      ).toBeUndefined();
    } finally {
      error.mockRestore();
      warn.mockRestore();
    }
  });
});
