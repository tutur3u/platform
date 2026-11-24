import { describe, expect, it, vi } from 'vitest';
import {
  runSelfOutboxDelivery,
  SELF_OUTBOX_MAX_DELIVERIES,
  selfOutboxDeadline,
} from './room-self-capture-delivery';
import type { RoomServiceState } from './room-service';
import { releaseParticipant } from './index';
import { settleSelfCapture } from './room-self-capture-state';
import { alice, open, selfRoom, streamA } from './room-self-capture.fixtures';
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

function harness(state: RoomServiceState, reply: () => Promise<Response>) {
  let current = state;
  const writes: RoomServiceState[] = [];
  const fetch = vi.fn(async (request: Request) => {
    expect(request.url).toBe('https://meet.internal/api/meet-ai/self/outbox');
    const token = request.headers.get('Authorization')!.slice('Bearer '.length);
    expect(verifyMeetSelfOutboxCredential(token, secret, T)).toMatchObject({
      purpose: 'self-outbox',
      roomId: 'room-1',
    });
    return reply();
  });
  const run = (now: number, env: object = { MEET_AI_SELF_OUTBOX: { fetch } }) =>
    runSelfOutboxDelivery({
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
    });
    expect(h.read().selfCapture?.outbox).toEqual([]);
    expect(h.read().selfCapture?.delivery).toBeUndefined();
    expect(selfOutboxDeadline(h.read(), env)).toBeUndefined();
  });

  it('stops after six deliveries with doubling backoff', async () => {
    const h = harness(
      pendingRoom(),
      async () => new Response(null, { status: 503 })
    );
    let now = T;
    const sends: number[] = [];
    for (let i = 0; i < 100; i++) {
      const before = h.fetch.mock.calls.length;
      await h.run(now);
      if (h.fetch.mock.calls.length > before) sends.push(now - T);
      now += 10_000;
    }
    expect(h.fetch).toHaveBeenCalledTimes(SELF_OUTBOX_MAX_DELIVERIES);
    expect(sends).toEqual([10_000, 30_000, 70_000, 150_000, 310_000, 630_000]);
    expect(h.read().selfCapture?.delivery?.attempts).toBe(6);
    expect(h.read().selfCapture?.outbox).toHaveLength(1);
    expect(
      selfOutboxDeadline(h.read(), { MEET_AI_SELF_OUTBOX: { fetch: h.fetch } })
    ).toBeUndefined();
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
