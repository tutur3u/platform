import { describe, expect, it } from 'vitest';
import { endMeetRoom } from './room-ending';
import { selectSelfOutboxBatch } from './room-self-capture-delivery';
import type { RoomServiceState } from './room-service';
import {
  endSelfCaptureSession,
  pendingFor,
  SELF_OUTBOX_MAX_ENTRIES,
  type SelfOutboxEntry,
  settleSelfCapture,
} from './room-self-capture-state';
import {
  alice,
  begin,
  bob,
  commit,
  host,
  open,
  otherSession,
  outbox,
  selfRoom,
  sessionId,
  streamA,
  streamB,
} from './room-self-capture.fixtures';

const T = 1_000_000;
const ended = () =>
  endMeetRoom(
    open(open(selfRoom(), alice, streamA), bob, streamB),
    new Date(T).toISOString()
  ) as RoomServiceState;
const ends = (state: RoomServiceState) =>
  (state.selfCapture?.outbox ?? []).filter((entry) => entry.kind === 'end');

describe('the session end entry', () => {
  it('follows the closes, keyed to the host, with a fresh seq', () => {
    const state = ended();
    const [end] = ends(state);
    expect(end).toEqual({ sessionId, accountId: host, seq: 5, kind: 'end' });
    expect(state.selfCapture?.seqCounter).toBe(5);
    expect(outbox(state).at(-1)).toEqual({
      accountId: host,
      seq: 5,
      kind: 'end',
    });
  });

  it('is queued exactly once', () => {
    const state = ended();
    expect(endSelfCaptureSession(state.selfCapture, T + 1)).toBe(
      state.selfCapture
    );
    expect(settleSelfCapture(state, T + 1)).toBe(state);
    expect(ends(state)).toHaveLength(1);
  });

  it('is never followed or coalesced by a late entry of its session', () => {
    const begun = begin(open(selfRoom(), alice, streamA), alice);
    const state = endMeetRoom(
      begun.state,
      new Date(T).toISOString()
    ) as RoomServiceState;
    // A late commit of the ended session queues nothing.
    const late = commit(
      state,
      alice,
      begun.body.epoch as number,
      streamA,
      2,
      T + 1
    );
    expect(late.body).toMatchObject({ committed: false });
    expect(late.state.selfCapture?.outbox).toEqual(state.selfCapture?.outbox);
    expect(ends(late.state)).toHaveLength(1);
  });

  it('is queued at the open cap, which it counts toward', () => {
    const state = open(selfRoom(), alice, streamA);
    const full = {
      ...state.selfCapture!,
      outbox: Array.from({ length: SELF_OUTBOX_MAX_ENTRIES }, (_, i) => ({
        sessionId: otherSession,
        accountId: bob,
        seq: i + 1,
        kind: 'close' as const,
      })),
    };
    const next = endSelfCaptureSession(full, T)!;
    expect(next.outbox).toHaveLength(SELF_OUTBOX_MAX_ENTRIES + 2);
    expect(next.outbox.at(-1)?.kind).toBe('end');
  });
});

describe('the end entry ordering', () => {
  const other = (i: number) =>
    `00000000-0000-4000-9000-${String(i).padStart(12, '0')}`;
  /** A session end after `n` entries, one account each or all on one. */
  function queued(n: number, oneAccount = false) {
    const capture = endMeetRoom(
      selfRoom(),
      new Date(T).toISOString()
    ).selfCapture!;
    const before: SelfOutboxEntry[] = Array.from({ length: n }, (_, i) => ({
      sessionId,
      accountId: other(oneAccount ? 0 : i),
      seq: i + 1,
      kind: 'close',
    }));
    return { ...capture, outbox: [...before, ...capture.outbox] };
  }

  it('reaches the host only with every earlier entry of the session', () => {
    expect(pendingFor(queued(2), host).at(-1)?.kind).toBe('end');
    // Past the 32 other entries per reply, the end waits.
    const many = pendingFor(queued(40), host);
    expect(many).toHaveLength(32);
    expect(many.some((entry) => entry.kind === 'end')).toBe(false);
  });

  it('is delivered only after the earlier entries of its session', () => {
    expect(selectSelfOutboxBatch(queued(2)).at(-1)?.kind).toBe('end');
    // Nine entries of one account exceed its batch share of eight, so the
    // end waits for the next delivery.
    const batch = selectSelfOutboxBatch(queued(9, true));
    expect(batch).toHaveLength(8);
    expect(batch.some((entry) => entry.kind === 'end')).toBe(false);
    // An account that keeps failing never moves the session end ahead of it.
    const failing = {
      ...queued(1),
      delivery: {
        attempts: 1,
        nextAt: T,
        startedAt: T,
        failures: { [other(0)]: 3 },
      },
    };
    expect(selectSelfOutboxBatch(failing).map((entry) => entry.kind)).toEqual([
      'close',
      'end',
    ]);
  });
});
