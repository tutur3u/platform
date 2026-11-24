import { describe, expect, it } from 'vitest';
import { MEET_CLASS_COHOST_SCOPE } from './class-timer';
import type { RoomServiceState } from './room-service';
import {
  revokeSelfCapture,
  SELF_OUTBOX_MAX_ENTRIES,
  settleSelfCapture,
  type SelfOutboxEntry,
} from './room-self-capture-state';
import {
  alice,
  begin,
  bob,
  host,
  ok,
  open,
  otherSession,
  selfRoom,
  sessionId,
  streamA,
  svc,
  transcriptChoice,
} from './room-self-capture.fixtures';
import {
  MEET_SERVICE_TTL_SECONDS,
  signMeetServiceCredential,
  verifyMeetSelfOutboxCredential,
} from './service-credential';

const T = 1_000_000;
const start = (id: string, extra: Record<string, unknown> = {}) => ({
  action: 'transcript.session',
  sessionId: id,
  active: true,
  protocol: 'self_v1',
  generation: 1,
  ...extra,
});
const stop = (id: string) => ({
  action: 'transcript.session',
  sessionId: id,
  active: false,
  protocol: 'self_v1',
});

describe('self_v1 session recording', () => {
  it('refuses a different session while one is live', () => {
    const state = selfRoom();
    const result = svc(state, host, start(otherSession), T);
    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({ code: 'MEET_SELF_SESSION_LIVE' });
    // After the drain deadline a new session may start.
    const stopped = ok(svc(state, host, stop(sessionId), T));
    expect(svc(stopped, host, start(otherSession), T + 1000).status).toBe(409);
    expect(
      svc(stopped, host, start(otherSession), T + 21_000).status
    ).toBeUndefined();
  });

  it('never re-activates an ended session and never restarts a sequence', () => {
    let state = open(selfRoom(), alice, streamA);
    state = ok(svc(state, alice, transcriptChoice('decline'), T));
    const counter = state.selfCapture!.seqCounter!;
    state = ok(svc(state, host, stop(sessionId), T));
    state = ok(svc(state, host, start(otherSession), T + 21_000));
    expect(state.selfCapture?.endedSessions).toEqual([sessionId]);
    // The old session's withdraw is still queued.
    expect(state.selfCapture?.outbox.map((e) => [e.sessionId, e.kind])).toEqual(
      [[sessionId, 'withdraw']]
    );
    const back = svc(state, host, start(sessionId), T + 22_000);
    expect(back.status).toBe(409);
    expect(back.body).toMatchObject({ code: 'MEET_SELF_SESSION_ENDED' });
    // New numbers continue above every earlier one.
    state = ok(svc(state, alice, transcriptChoice('allow'), T + 60_000));
    const reopened = svc(
      state,
      alice,
      { action: 'transcription.self.openBegin', sessionId: otherSession },
      T + 60_000
    );
    expect(reopened.body).toMatchObject({
      allowed: true,
      allowSeq: counter + 1,
    });
  });

  it('only a manager starts a session and only its host re-records it', () => {
    const state = selfRoom();
    const stopped = ok(svc(state, host, stop(sessionId), T));
    expect(svc(stopped, alice, start(otherSession), T + 21_000).status).toBe(
      403
    );
    expect(
      svc(stopped, alice, start(otherSession), T + 21_000, {
        scopes: ['meet:server', MEET_CLASS_COHOST_SCOPE],
      }).status
    ).toBeUndefined();
    // Re-recording the live session by someone else is refused.
    expect(
      svc(state, bob, start(sessionId, { generation: 9 }), T, {
        scopes: ['meet:server', MEET_CLASS_COHOST_SCOPE],
      }).status
    ).toBe(403);
    const again = ok(svc(state, host, start(sessionId, { generation: 5 }), T));
    expect(again.selfCapture?.session).toMatchObject({
      generation: 5,
      status: 'active',
    });
  });
});

describe('revocation', () => {
  it('revokes an account removed without a ledger entry, outside the account cap', () => {
    const state = revokeSelfCapture(selfRoom(), bob, T);
    expect(state.selfCapture?.revoked).toEqual({ [bob]: true });
    expect(state.selfCapture?.accounts[bob]).toBeUndefined();
    expect(state.selfCapture?.outbox).toEqual([]);
    expect(begin(state, bob).body).toMatchObject({
      allowed: false,
      reason: 'revoked',
    });
  });

  it('keeps revocations when a new session starts', () => {
    let state = revokeSelfCapture(open(selfRoom(), alice, streamA), alice, T);
    state = ok(svc(state, host, stop(sessionId), T));
    state = ok(svc(state, host, start(otherSession), T + 21_000));
    expect(state.selfCapture?.revoked?.[alice]).toBe(true);
    const begun = svc(
      state,
      alice,
      { action: 'transcription.self.openBegin', sessionId: otherSession },
      T + 60_000
    );
    expect(begun.body).toMatchObject({ allowed: false, reason: 'revoked' });
  });
});

describe('outbox bound', () => {
  it('refuses new opens once the outbox holds 512 entries, never dropping one', () => {
    const state = selfRoom();
    const outbox: SelfOutboxEntry[] = Array.from(
      { length: SELF_OUTBOX_MAX_ENTRIES },
      (_, i) => ({
        sessionId: otherSession,
        accountId: bob,
        seq: i + 1,
        kind: 'close',
      })
    );
    const full: RoomServiceState = {
      ...state,
      selfCapture: { ...state.selfCapture!, outbox },
    };
    const result = begin(full, alice);
    expect(result.body).toMatchObject({ allowed: false, reason: 'capacity' });
    expect(result.state.selfCapture?.outbox).toHaveLength(
      SELF_OUTBOX_MAX_ENTRIES
    );
    // An ending still queues past the bound.
    const opened = open(selfRoom(), alice, streamA);
    const over: RoomServiceState = {
      ...opened,
      selfCapture: {
        ...opened.selfCapture!,
        outbox: [...outbox, ...opened.selfCapture!.outbox],
      },
    };
    const declined = ok(svc(over, alice, transcriptChoice('decline'), T));
    expect(declined.selfCapture?.outbox).toHaveLength(
      SELF_OUTBOX_MAX_ENTRIES + 1
    );
    expect(settleSelfCapture(declined, T)).toBe(declined);
  });
});

describe('outbox credential', () => {
  it('refuses a lifetime longer than one delivery', () => {
    const secret = 'secret';
    const nowMs = 2_000_000_000_000;
    const token = (exp: number) =>
      signMeetServiceCredential(
        { aud: 'meet-service', purpose: 'self-outbox', roomId: 'r', exp },
        secret
      );
    const now = Math.floor(nowMs / 1000);
    expect(
      verifyMeetSelfOutboxCredential(
        token(now + MEET_SERVICE_TTL_SECONDS),
        secret,
        nowMs
      )
    ).not.toBeNull();
    expect(
      verifyMeetSelfOutboxCredential(token(now + 3600), secret, nowMs)
    ).toBeNull();
    expect(
      verifyMeetSelfOutboxCredential(token(now - 1), secret, nowMs)
    ).toBeNull();
  });
});
