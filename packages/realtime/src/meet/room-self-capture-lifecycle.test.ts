import { describe, expect, it } from 'vitest';
import { MEET_CLASS_COHOST_SCOPE } from './class-timer';
import { releaseParticipant } from './index';
import type { RoomServiceState } from './room-service';
import {
  SELF_CAPTURE_DEADLINE_MS,
  SELF_CAPTURE_MAX_REVOKED,
} from './room-self-capture-state';
import {
  alice,
  authorize,
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
} from './room-self-capture.fixtures';

const T = 1_000_000;
const cohost = { scopes: ['meet:server', MEET_CLASS_COHOST_SCOPE] };
const session = (id: string, active: boolean) => ({
  action: 'transcript.session',
  sessionId: id,
  active,
  protocol: 'self_v1',
  generation: 1,
});
const hostLeft = () =>
  releaseParticipant(selfRoom(), host, 'room', new Date(T).toISOString())
    .state as RoomServiceState;

describe('a self_v1 session after its host leaves', () => {
  it('a co-host ends it and starts the next one', () => {
    let state = hostLeft();
    // Before the stop the live session blocks a new one.
    expect(
      svc(state, bob, session(otherSession, true), T, cohost).body
    ).toMatchObject({ code: 'MEET_SELF_SESSION_LIVE' });
    // A participant who is not a manager cannot end it.
    state = ok(svc(state, alice, session(sessionId, false), T));
    expect(state.selfCapture?.session?.status).toBe('active');
    state = ok(svc(state, bob, session(sessionId, false), T, cohost));
    expect(state.selfCapture?.session?.status).toBe('draining');
    expect(state.transcriptConsent?.active).toBeUndefined();
    const next = ok(
      svc(state, bob, session(otherSession, true), T + 21_000, cohost)
    );
    expect(next.selfCapture?.session).toMatchObject({
      sessionId: otherSession,
      status: 'active',
      hostAccountId: bob,
      captureUntil: T + 21_000 + SELF_CAPTURE_DEADLINE_MS,
    });
    expect(next.selfCapture?.endedSessions).toEqual([sessionId]);
  });

  it('the same ended id is refused, not re-recorded', () => {
    const stopped = ok(svc(selfRoom(), host, session(sessionId, false), T));
    const again = svc(stopped, host, session(sessionId, true), T + 21_000);
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ code: 'MEET_SELF_SESSION_ENDED' });
  });
});

describe('the room-side capture deadline', () => {
  it('ends the session three hours after it started', () => {
    const state = open(selfRoom(), alice, streamA);
    const late = T + SELF_CAPTURE_DEADLINE_MS;
    expect(
      authorize(state, alice, streamA, 1, false, late - 1).body.allowed
    ).toBe(true);
    expect(authorize(state, alice, streamA, 1, false, late).body).toMatchObject(
      {
        allowed: false,
        reason: 'no_session',
      }
    );
    expect(begin(state, alice, late).body).toMatchObject({
      allowed: false,
      reason: 'no_session',
    });
    expect(
      svc(state, alice, { action: 'transcript.consent.read' }, late).body
    ).toMatchObject({ session: null });
    // The mode unlocks and a new session may start.
    expect(
      svc(state, host, { action: 'transcript.mode.set', mode: 'room' }, late)
        .body
    ).toEqual({ mode: 'room' });
    const next = ok(svc(state, host, session(otherSession, true), late));
    expect(next.selfCapture?.session?.sessionId).toBe(otherSession);
    expect(next.selfCapture?.outbox.map((e) => e.kind)).toEqual([
      'close',
      'end',
    ]);
  });
});

describe('a full removal set fails closed', () => {
  it('refuses new opens once 1024 removals are recorded', () => {
    const state = selfRoom();
    const revoked = Object.fromEntries(
      Array.from({ length: SELF_CAPTURE_MAX_REVOKED }, (_, i) => [
        `00000000-0000-4000-9000-${String(i).padStart(12, '0')}`,
        true as const,
      ])
    );
    const full: RoomServiceState = {
      ...state,
      selfCapture: { ...state.selfCapture!, revoked },
    };
    expect(begin(full, alice).body).toMatchObject({
      allowed: false,
      reason: 'capacity',
    });
  });
});
