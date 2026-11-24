import { describe, expect, it } from 'vitest';
import { pruneMeetPresence, releaseParticipant } from './index';
import { endMeetRoom } from './room-ending';
import { applyRoomRestore } from './room-lifecycle';
import { applyMiraRoomConsent } from './room-mira-consent';
import { endMira, miraChoice } from './room-mira.fixtures';
import type { RoomServiceState } from './room-service';
import {
  revokeSelfCapture,
  settleSelfCapture,
} from './room-self-capture-state';
import {
  admit,
  alice,
  authorize,
  begin,
  bob,
  commit,
  host,
  miraOn,
  ok,
  open,
  outbox,
  selfRoom,
  streamA,
  streamB,
  svc,
  tokenOf,
  transcriptChoice,
} from './room-self-capture.fixtures';
import { MEET_TRANSCRIPT_NOTICE_VERSION } from './room-transcript-consent';

const T = 1_000_000;
const leave = (state: RoomServiceState, id: string) =>
  settleSelfCapture(
    releaseParticipant(state, id, 'room', new Date(T).toISOString()).state,
    T
  ) as RoomServiceState;

describe('room-side endings reach the legal outbox', () => {
  it('untick queues a withdraw and closes the live fence at once', () => {
    let state = open(selfRoom(), alice, streamA);
    state = ok(svc(state, alice, transcriptChoice('decline'), T));
    expect(outbox(state)).toEqual([
      { accountId: alice, seq: 2, kind: 'withdraw' },
    ]);
    expect(state.selfCapture?.outbox[0]?.noticeVersion).toBe(
      MEET_TRANSCRIPT_NOTICE_VERSION
    );
    expect(authorize(state, alice, streamA).body).toMatchObject({
      allowed: false,
      reason: 'consent',
    });
  });

  it('Mira off for me queues a withdraw', () => {
    let state = open(selfRoom(), alice, streamA);
    state = ok(svc(state, alice, miraChoice(state, 'off'), T));
    expect(outbox(state)).toEqual([
      { accountId: alice, seq: 2, kind: 'withdraw' },
    ]);
    expect(state.selfCapture?.accounts[alice]?.epoch).toBe(2);
  });

  it('Mira turned off and a minor report withdraw every allowed account', () => {
    const base = open(open(selfRoom(), alice, streamA), bob, streamB);
    for (const [who, reason, role] of [
      [host, 'turned_off', 'host'],
      [alice, 'minor_reported', 'speaker'],
    ] as const) {
      const ended = endMira(base, who, reason, role, T);
      const state = settleSelfCapture(ended.state, T);
      expect(outbox(state)).toEqual([
        { accountId: alice, seq: 2, kind: 'withdraw' },
        { accountId: bob, seq: 2, kind: 'withdraw' },
      ]);
    }
  });

  it('a notice version change withdraws', () => {
    const state = open(selfRoom(), alice, streamA);
    const choices = state.transcriptConsent!.choices;
    const stale: RoomServiceState = {
      ...state,
      transcriptConsent: {
        ...state.transcriptConsent!,
        choices: {
          ...choices,
          [alice]: { ...choices[alice]!, version: 'old' },
        },
      },
    };
    expect(outbox(settleSelfCapture(stale, T))).toEqual([
      { accountId: alice, seq: 2, kind: 'withdraw' },
    ]);
  });

  it('leave and heartbeat expiry close only the stream, and the person can reopen', () => {
    let state = open(selfRoom(), alice, streamA);
    state = leave(state, alice);
    expect(outbox(state)).toEqual([
      { accountId: alice, seq: 2, kind: 'close' },
    ]);
    expect(state.selfCapture?.accounts[alice]?.legalAllow).toBeDefined();
    state = admit(state, alice);
    const again = begin(state, alice, T + 1);
    expect(again.body).toMatchObject({ allowed: true, allowSeq: 3 });
    expect(again.body.pending).toEqual([
      expect.objectContaining({ accountId: alice, seq: 2, kind: 'close' }),
    ]);
    // Still under the first allow: no new allow is counted.
    expect(again.state.selfCapture?.accounts[alice]?.allows).toBe(1);

    const expiring = open(selfRoom(), bob, streamB);
    const stale = {
      ...expiring,
      presence: {
        ...expiring.presence,
        [bob]: {
          ...expiring.presence[bob]!,
          lastSeenAt: new Date(0).toISOString(),
        },
      },
    };
    const pruned = settleSelfCapture(
      pruneMeetPresence(stale, T) as RoomServiceState,
      T
    );
    expect(outbox(pruned)).toEqual([{ accountId: bob, seq: 2, kind: 'close' }]);
  });

  it('removal revokes and supersedes a pending close', () => {
    let state = open(selfRoom(), alice, streamA);
    state = leave(state, alice);
    state = revokeSelfCapture(state, alice, T);
    expect(outbox(state)).toEqual([
      { accountId: alice, seq: 3, kind: 'revoke' },
    ]);
    // Nothing follows a pending revoke, and no further opens.
    state = revokeSelfCapture(state, alice, T);
    expect(outbox(state)).toHaveLength(1);
    state = admit(state, alice);
    expect(begin(state, alice).body).toMatchObject({
      allowed: false,
      reason: 'revoked',
    });
  });

  it('room end closes streams, ends the session and emits no withdraw', () => {
    let state = open(open(selfRoom(), alice, streamA), bob, streamB);
    state = endMeetRoom(state, new Date(T).toISOString()) as RoomServiceState;
    expect(outbox(state)).toEqual([
      { accountId: alice, seq: 2, kind: 'close' },
      { accountId: bob, seq: 2, kind: 'close' },
    ]);
    expect(state.selfCapture?.session?.status).toBe('ended');
    expect(settleSelfCapture(state, T)).toBe(state);
  });

  it('settle is idempotent and leaves rooms without a self session alone', () => {
    const state = open(selfRoom(), alice, streamA);
    expect(settleSelfCapture(state, T)).toBe(state);
    const declined = ok(svc(state, alice, transcriptChoice('decline'), T));
    expect(settleSelfCapture(declined, T + 5)).toBe(declined);
  });
});

describe('open-stream epoch race', () => {
  it('an untick between begin and commit closes the new stream', () => {
    const begun = begin(selfRoom(), alice);
    const declined = ok(
      svc(begun.state, alice, transcriptChoice('decline'), T)
    );
    const result = commit(declined, alice, begun.body.epoch as number, streamA);
    expect(result.body.committed).toBe(false);
    // The withdraw queued by the untick follows the allow and ends stream S.
    expect(result.body.pending).toEqual([
      expect.objectContaining({ accountId: alice, seq: 2, kind: 'withdraw' }),
    ]);
    expect(outbox(result.state)).toHaveLength(1);
    expect(authorize(result.state, alice, streamA).body.allowed).toBe(false);
  });

  it('a leave between begin and commit closes the new stream', () => {
    const begun = begin(selfRoom(), alice);
    const left = leave(begun.state, alice);
    const result = commit(left, alice, begun.body.epoch as number, streamA);
    expect(result.body).toMatchObject({ committed: false });
    expect(result.body.pending).toEqual([
      expect.objectContaining({ accountId: alice, seq: 2, kind: 'close' }),
    ]);
  });

  it('a stale epoch queues a compensating withdraw with a higher seq', () => {
    const first = begin(selfRoom(), alice);
    const second = begin(first.state, alice, T + 1);
    const stale = commit(
      second.state,
      alice,
      first.body.epoch as number,
      streamA
    );
    expect(stale.body.committed).toBe(false);
    expect(stale.body.pending).toEqual([
      expect.objectContaining({ accountId: alice, seq: 3, kind: 'withdraw' }),
    ]);
    // The newer begin is fenced too; the client opens again.
    const newer = commit(
      stale.state,
      alice,
      second.body.epoch as number,
      streamB
    );
    expect(newer.body.committed).toBe(false);
  });

  it('an acceptance change between begin and commit refuses the commit', () => {
    const begun = begin(selfRoom(), alice);
    const replaced = applyMiraRoomConsent(
      begun.state,
      tokenOf(host),
      {
        action: 'mira.room.accept',
        revision: 2,
        capabilities: ['chat'],
        noticeVersion: '2026-11-24-room-v2',
        audienceAdultConfirmed: true,
      },
      T
    )!;
    const result = commit(
      replaced.state,
      alice,
      begun.body.epoch as number,
      streamA
    );
    expect(result.body.committed).toBe(false);
    expect(result.body.pending?.some((e) => e.kind === 'withdraw')).toBe(true);
  });

  it('Withdraw then Allow before a drain yields withdraw then a fresh allow', () => {
    let state = open(selfRoom(), alice, streamA);
    state = ok(svc(state, alice, transcriptChoice('decline'), T));
    state = ok(svc(state, alice, transcriptChoice('allow'), T + 1));
    const again = begin(state, alice, T + 2);
    expect(again.body).toMatchObject({ allowed: true, allowSeq: 3 });
    expect(again.body.pending).toEqual([
      expect.objectContaining({ accountId: alice, seq: 2, kind: 'withdraw' }),
    ]);
    expect(again.state.selfCapture?.accounts[alice]?.allows).toBe(2);
  });

  it('a pending entry never reopens capture', () => {
    let state = open(selfRoom(), alice, streamA);
    state = ok(svc(state, alice, miraChoice(state, 'off'), T));
    state = miraOn(state, alice, T + 1);
    // Mira back on, but the transcript choice stays declined.
    expect(begin(state, alice, T + 2).body).toMatchObject({
      allowed: false,
      reason: 'consent',
    });
    expect(authorize(state, alice, streamA).body.allowed).toBe(false);
  });
});

describe('room restore', () => {
  it('keeps the outbox, epochs, sequences, buckets and delivery count', () => {
    let state = open(open(selfRoom(), alice, streamA), bob, streamB);
    state = {
      ...state,
      budget: {
        expiresAt: T + 3_600_000,
        accountedAt: T,
        participantMilliseconds: 0,
        maxPublishers: 10,
        maxViewers: 10,
      },
      lifecycle: { version: 0, hadConnection: true, ownerAccountId: host },
    };
    state = endMeetRoom(state, new Date(T).toISOString()) as RoomServiceState;
    state = {
      ...state,
      selfCapture: {
        ...state.selfCapture!,
        delivery: { attempts: 2, nextAt: T + 40_000 },
      },
    };
    const before = state.selfCapture!;
    const restored = applyRoomRestore(
      state,
      tokenOf(host),
      { action: 'room.restore', expectedVersion: state.lifecycle!.version },
      T + 1000
    )!;
    expect(restored.status).toBeUndefined();
    expect(restored.state.selfCapture?.outbox).toEqual(before.outbox);
    expect(restored.state.selfCapture?.accounts).toEqual(before.accounts);
    expect(restored.state.selfCapture?.buckets).toEqual(before.buckets);
    expect(restored.state.selfCapture?.delivery).toEqual({
      attempts: 2,
      nextAt: T + 40_000,
    });
    expect(restored.state.selfCapture?.mode).toBe('self');
    // The ended session stays ended; a new allow needs a new session.
    expect(settleSelfCapture(restored.state, T + 2000)).toBe(restored.state);
  });
});

describe('outbox bounds', () => {
  it('at most 24 accounts per session', () => {
    let state = selfRoom();
    const accounts: Record<
      string,
      { epoch: number; seq: number; allows: number }
    > = {};
    for (let i = 0; i < 24; i++)
      accounts[`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`] = {
        epoch: 1,
        seq: 1,
        allows: 1,
      };
    state = { ...state, selfCapture: { ...state.selfCapture!, accounts } };
    expect(begin(state, alice).body).toMatchObject({
      allowed: false,
      reason: 'capacity',
    });
  });

  it('keeps at most one stream entry per account', () => {
    let state = open(selfRoom(), alice, streamA);
    state = leave(state, alice);
    state = admit(state, alice);
    state = open(state, alice, streamB, 1, T + 1);
    state = leave(state, alice);
    expect(outbox(state).filter((e) => e.accountId === alice)).toEqual([
      { accountId: alice, seq: 4, kind: 'close' },
    ]);
  });
});
