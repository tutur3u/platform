import { describe, expect, it } from 'vitest';
import { MEET_CLASS_COHOST_SCOPE } from './class-timer';
import { releaseParticipant } from './index';
import {
  runSelfOutboxDelivery,
  selectSelfOutboxBatch,
  selfOutboxDeadline,
  SELF_OUTBOX_BATCH,
} from './room-self-capture-delivery';
import type { RoomServiceState } from './room-service';
import {
  pendingFor,
  revokeSelfCapture,
  SELF_CAPTURE_DRAIN_MS,
  type SelfCaptureState,
  type SelfOutboxEntry,
  settleSelfCapture,
} from './room-self-capture-state';
import {
  bob,
  host,
  ok,
  otherSession,
  selfRoom,
  sessionId,
  svc,
} from './room-self-capture.fixtures';

const T = 1_000_000;
const id = (group: number, i: number) =>
  `00000000-0000-4000-${group}000-${String(i).padStart(12, '0')}`;
const binding = (fetch: (request: Request) => Promise<Response>) => ({
  MEET_AI_SELF_OUTBOX: { fetch },
});

/**
 * `sessions` sessions, each with one close of its own participant and then
 * its end, keyed to one of eight hosts. Hosts never failed; participants
 * failed `failed` times, so a failure-ordered pick meets the ends first.
 */
function crowded(sessions: number, failed = 1): SelfCaptureState {
  const outbox: SelfOutboxEntry[] = [];
  const failures: Record<string, number> = {};
  for (let i = 0; i < sessions; i++) {
    const session = id(9, i);
    failures[id(8, i)] = failed;
    outbox.push(
      {
        sessionId: session,
        accountId: id(8, i),
        seq: 2 * i + 1,
        kind: 'close',
      },
      {
        sessionId: session,
        accountId: id(7, i % 8),
        seq: 2 * i + 2,
        kind: 'end',
      }
    );
  }
  return {
    mode: 'self',
    accounts: {},
    outbox,
    delivery: { attempts: 0, nextAt: T, startedAt: T, failures },
  };
}

describe('a delivery batch with session ends', () => {
  it('is never empty while participant entries wait behind held ends', () => {
    const capture = crowded(SELF_OUTBOX_BATCH);
    const batch = selectSelfOutboxBatch(capture);
    expect(batch).toHaveLength(SELF_OUTBOX_BATCH);
    expect(batch.every((entry) => entry.kind === 'close')).toBe(true);
    expect(selfOutboxDeadline({ selfCapture: capture }, binding(fetch))).toBe(
      T
    );
  });

  it('gives held ends no slot and fills only the capacity left', () => {
    const capture = crowded(10);
    // One participant has nine entries in an eleventh session, one over its
    // share, so that session's end is held.
    const lagging = id(6, 0);
    const held = id(9, 99);
    for (let i = 0; i < 9; i++)
      capture.outbox.push({
        sessionId: held,
        accountId: lagging,
        seq: 100 + i,
        kind: 'close',
      });
    capture.outbox.push({
      sessionId: held,
      accountId: host,
      seq: 200,
      kind: 'end',
    });
    const batch = selectSelfOutboxBatch(capture);
    const closes = batch.filter((entry) => entry.kind === 'close');
    const ends = batch.filter((entry) => entry.kind === 'end');
    expect(closes).toHaveLength(10 + 8);
    expect(ends).toHaveLength(10);
    expect(ends.some((entry) => entry.sessionId === held)).toBe(false);
    // Every end follows the participant entries.
    expect(batch.findIndex((entry) => entry.kind === 'end')).toBe(
      closes.length
    );
  });

  it('keeps one slot for an end whose session has nothing left to send', () => {
    // Eight accounts each keep eight unacknowledged closes of a live session:
    // enough to fill every slot on every delivery.
    const outbox: SelfOutboxEntry[] = [];
    for (let a = 0; a < 8; a++)
      for (let i = 0; i < 8; i++)
        outbox.push({
          sessionId: id(9, 50),
          accountId: id(8, a),
          seq: 8 * a + i + 1,
          kind: 'close',
        });
    // A finished session whose closes were all acknowledged.
    outbox.push({
      sessionId: id(9, 51),
      accountId: host,
      seq: 100,
      kind: 'end',
    });
    const batch = selectSelfOutboxBatch({
      mode: 'self',
      accounts: {},
      outbox,
      delivery: { attempts: 0, nextAt: T, startedAt: T },
    });
    expect(batch).toHaveLength(SELF_OUTBOX_BATCH);
    expect(batch.filter((entry) => entry.kind === 'close')).toHaveLength(
      SELF_OUTBOX_BATCH - 1
    );
    expect(batch.at(-1)).toMatchObject({ sessionId: id(9, 51), kind: 'end' });
  });

  it('releases a held end on the delivery after its entries are acknowledged', async () => {
    // Nine closes of one account: one over its per-batch share, so the end
    // is held on the first delivery and goes on the second.
    const outbox: SelfOutboxEntry[] = [];
    for (let i = 0; i < 9; i++)
      outbox.push({ sessionId, accountId: bob, seq: i + 1, kind: 'close' });
    outbox.push({ sessionId, accountId: host, seq: 10, kind: 'end' });
    let state = {
      ...selfRoom(),
      selfCapture: {
        mode: 'self',
        accounts: {},
        outbox,
        delivery: { attempts: 0, nextAt: T, startedAt: T },
      } as SelfCaptureState,
    };
    const posted: SelfOutboxEntry[][] = [];
    const deliver = (now: number) =>
      runSelfOutboxDelivery({
        env: binding(async (request) => {
          const body = (await request.json()) as {
            entries: SelfOutboxEntry[];
          };
          posted.push(body.entries);
          return Response.json({ acked: body.entries });
        }),
        secret: 'test-secret',
        roomName: 'room',
        now,
        read: () => state,
        commit: async (next) => {
          state = next;
        },
      });
    await deliver(T);
    expect(posted[0]).toHaveLength(8);
    expect(posted[0]!.every((entry) => entry.kind === 'close')).toBe(true);
    // The next delivery runs when the first one scheduled it.
    await deliver(state.selfCapture.delivery?.nextAt ?? T);
    expect(posted[1]!.map((entry) => entry.kind)).toEqual(['close', 'end']);
    expect(state.selfCapture.outbox).toEqual([]);
  });

  it('the pending list does the same within its budget', () => {
    const pending = pendingFor(crowded(40), host);
    expect(pending).toHaveLength(32);
    expect(pending.every((entry) => entry.kind === 'close')).toBe(true);
  });

  it('posts the participant entries and spends one attempt', async () => {
    let state = { ...selfRoom(), selfCapture: crowded(SELF_OUTBOX_BATCH) };
    const posted: SelfOutboxEntry[][] = [];
    await runSelfOutboxDelivery({
      env: binding(async (request) => {
        const body = (await request.json()) as { entries: SelfOutboxEntry[] };
        posted.push(body.entries);
        return Response.json({ acked: [] });
      }),
      secret: 'test-secret',
      roomName: 'room',
      now: T,
      read: () => state,
      commit: async (next) => {
        state = next;
      },
    });
    expect(posted).toHaveLength(1);
    expect(posted[0]).toHaveLength(SELF_OUTBOX_BATCH);
    expect(state.selfCapture.deliveryDay).toEqual({ day: 0, count: 1 });
  });
});

describe('delivery failures and session ends', () => {
  const pair = (): SelfCaptureState => ({
    mode: 'self',
    accounts: {},
    outbox: [
      { sessionId, accountId: bob, seq: 1, kind: 'close' },
      { sessionId, accountId: host, seq: 2, kind: 'end' },
    ],
    delivery: { attempts: 0, nextAt: T, startedAt: T },
  });
  async function deliver(acked: (entries: SelfOutboxEntry[]) => unknown[]) {
    let state = { ...selfRoom(), selfCapture: pair() };
    await runSelfOutboxDelivery({
      env: binding(async (request) => {
        const body = (await request.json()) as { entries: SelfOutboxEntry[] };
        return Response.json({ acked: acked(body.entries) });
      }),
      secret: 'test-secret',
      roomName: 'room',
      now: T,
      read: () => state,
      commit: async (next) => {
        state = next;
      },
    });
    return state.selfCapture;
  }

  it('never count a held end against the host', async () => {
    const capture = await deliver(() => []);
    expect(capture.delivery?.failures).toEqual({ [bob]: 1 });
  });

  it('count an end that failed on its own', async () => {
    const capture = await deliver((entries) => entries.slice(0, 1));
    expect(capture.outbox.map((entry) => entry.kind)).toEqual(['end']);
    expect(capture.delivery?.failures).toEqual({ [host]: 1 });
  });
});

describe('session recording by a removed or absent manager', () => {
  const cohost = { scopes: ['meet:server', MEET_CLASS_COHOST_SCOPE] };
  const session = (sid: string, active: boolean, generation = 2) => ({
    action: 'transcript.session',
    sessionId: sid,
    active,
    protocol: 'self_v1',
    generation,
  });
  const after = T + SELF_CAPTURE_DRAIN_MS;
  const drained = () =>
    settleSelfCapture(
      ok(svc(selfRoom(), host, session(sessionId, false), T)),
      after
    );

  it('a removed co-host never starts a session', () => {
    const state = revokeSelfCapture(drained(), bob, after);
    const refused = svc(state, bob, session(otherSession, true), after, cohost);
    expect(refused.status).toBe(403);
    expect(refused.state.selfCapture?.session?.sessionId).toBe(sessionId);
    // The same co-host, present and not removed, may.
    expect(
      ok(svc(drained(), bob, session(otherSession, true), after, cohost))
        .selfCapture?.session?.sessionId
    ).toBe(otherSession);
    // An absent co-host is refused too.
    const gone = releaseParticipant(
      drained(),
      bob,
      'room',
      new Date(after).toISOString()
    ).state as RoomServiceState;
    expect(
      svc(gone, bob, session(otherSession, true), after, cohost).status
    ).toBe(403);
  });

  it('a removed or absent host never re-records a draining session', () => {
    const draining = ok(svc(selfRoom(), host, session(sessionId, false), T));
    const removed = revokeSelfCapture(draining, host, T + 1);
    const refused = svc(removed, host, session(sessionId, true, 9), T + 1);
    expect(refused.status).toBe(403);
    expect(refused.state.selfCapture?.session?.generation).toBe(2);
    const gone = releaseParticipant(
      draining,
      host,
      'room',
      new Date(T).toISOString()
    ).state as RoomServiceState;
    const absent = svc(gone, host, session(sessionId, true, 9), T + 1);
    expect(absent.status).toBe(403);
    expect(absent.state.selfCapture?.session?.generation).toBe(2);
    // The present host still may.
    expect(
      ok(svc(draining, host, session(sessionId, true, 9), T + 1)).selfCapture
        ?.session?.generation
    ).toBe(9);
  });
});
