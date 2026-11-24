import { describe, expect, it } from 'vitest';
import { MEET_CLASS_COHOST_SCOPE } from './class-timer';
import { endMeetRoom } from './room-ending';
import type { RoomServiceState } from './room-service';
import {
  revokeSelfCapture,
  SELF_CAPTURE_DEADLINE_MS,
  SELF_CAPTURE_DRAIN_MS,
  settleSelfCapture,
} from './room-self-capture-state';
import {
  alice,
  begin,
  bob,
  host,
  ok,
  open,
  otherSession,
  outbox,
  selfRoom,
  sessionId,
  streamA,
  svc,
  tokenOf,
} from './room-self-capture.fixtures';
import { applyMeetTranscriptConsent } from './room-transcript-consent';

const T = 1_000_000;
const late = T + SELF_CAPTURE_DEADLINE_MS;
const cohost = { scopes: ['meet:server', MEET_CLASS_COHOST_SCOPE] };
const session = (id: string, active: boolean, generation = 2) => ({
  action: 'transcript.session',
  sessionId: id,
  active,
  protocol: 'self_v1',
  generation,
});
const read = { action: 'transcript.consent.read' };
/** The consent view without the per-speaker settle step in front of it. */
const rawView = (state: RoomServiceState, now: number) =>
  applyMeetTranscriptConsent(state, tokenOf(alice), read, now)!.body as {
    active: boolean;
    session: unknown;
  };
const stopped = () =>
  ok(svc(open(selfRoom(), alice, streamA), host, session(sessionId, false), T));

describe('the transcript indicator of a self_v1 session', () => {
  it('stops showing once the capture deadline passes', () => {
    const state = selfRoom();
    expect(state.transcriptConsent?.active?.sessionId).toBe(sessionId);
    expect(rawView(state, late - 1)).toMatchObject({ active: true });
    expect(rawView(state, late)).toMatchObject({
      active: false,
      session: null,
    });
  });

  it('never shows while the session drains', () => {
    const draining = stopped();
    // Even an indicator left behind for the session is not shown.
    const leftover: RoomServiceState = {
      ...draining,
      transcriptConsent: {
        ...draining.transcriptConsent!,
        active: { accountId: host, sessionId, since: T },
      },
    };
    expect(rawView(leftover, T + 1)).toMatchObject({ active: false });
  });

  it('is not set again by a re-record while draining', () => {
    const draining = stopped();
    const again = svc(draining, host, session(sessionId, true, 5), T + 1_000);
    expect(again.status).toBeUndefined();
    expect(again.body).toMatchObject({ active: false });
    expect(again.state.transcriptConsent?.active).toBeUndefined();
    expect(again.state.selfCapture?.session).toMatchObject({
      status: 'draining',
      generation: 5,
      drainUntil: T + SELF_CAPTURE_DRAIN_MS,
    });
  });
});

describe('a session that is no longer live', () => {
  it('ends at the capture deadline and closes its streams', () => {
    const state = open(selfRoom(), alice, streamA);
    expect(settleSelfCapture(state, late - 1)).toBe(state);
    const ended = settleSelfCapture(state, late);
    expect(ended.selfCapture?.session?.status).toBe('ended');
    expect(ended.selfCapture?.endedSessions).toEqual([sessionId]);
    expect(outbox(ended)).toEqual([
      { accountId: alice, seq: 2, kind: 'close' },
      { accountId: host, seq: 3, kind: 'end' },
    ]);
    expect(ended.transcriptConsent?.active).toBeUndefined();
    // Settling again changes nothing.
    expect(settleSelfCapture(ended, late + 1)).toBe(ended);
  });

  it('ends when its drain is over and closes its streams', () => {
    const draining = stopped();
    expect(outbox(draining)).toEqual([]);
    const ended = settleSelfCapture(draining, T + SELF_CAPTURE_DRAIN_MS);
    expect(ended.selfCapture?.session?.status).toBe('ended');
    expect(outbox(ended)).toEqual([
      { accountId: alice, seq: 2, kind: 'close' },
      { accountId: host, seq: 3, kind: 'end' },
    ]);
  });
});

describe('a removal between sessions', () => {
  it('is remembered in per-speaker mode and refuses the next session', () => {
    const after = T + SELF_CAPTURE_DRAIN_MS;
    const ended = settleSelfCapture(stopped(), after);
    const removed = revokeSelfCapture(ended, bob, after);
    expect(removed.selfCapture?.revoked).toEqual({ [bob]: true });
    // No session is live, so no legal entry is queued for it.
    expect(outbox(removed)).toEqual(outbox(ended));
    const next = ok(svc(removed, host, session(otherSession, true), after));
    expect(
      begin(
        {
          ...next,
          selfCapture: {
            ...next.selfCapture!,
            session: { ...next.selfCapture!.session!, sessionId },
          },
        },
        bob,
        after
      ).body
    ).toMatchObject({ allowed: false, reason: 'revoked' });
  });

  it('is not recorded in room mode without a live session', () => {
    const roomMode = ok(
      svc(
        settleSelfCapture(stopped(), T + SELF_CAPTURE_DRAIN_MS),
        host,
        { action: 'transcript.mode.set', mode: 'room' },
        T + SELF_CAPTURE_DRAIN_MS
      )
    );
    expect(roomMode.selfCapture?.mode).toBe('room');
    expect(revokeSelfCapture(roomMode, bob, T + SELF_CAPTURE_DRAIN_MS)).toBe(
      roomMode
    );
  });
});

describe('a removed manager', () => {
  const removed = () => revokeSelfCapture(selfRoom(), bob, T);

  it('cannot change the mode, also after the session', () => {
    const live = svc(
      removed(),
      bob,
      { action: 'transcript.mode.set', mode: 'room' },
      T,
      cohost
    );
    expect(live.status).toBe(403);
    const after = T + SELF_CAPTURE_DRAIN_MS;
    const drained = settleSelfCapture(
      ok(svc(removed(), host, session(sessionId, false), T)),
      after
    );
    const refused = svc(
      drained,
      bob,
      { action: 'transcript.mode.set', mode: 'room' },
      after,
      cohost
    );
    expect(refused.status).toBe(403);
    expect(drained.selfCapture?.mode).toBe('self');
    // A manager who was not removed still can.
    expect(
      svc(drained, host, { action: 'transcript.mode.set', mode: 'room' }, after)
        .body
    ).toEqual({ mode: 'room' });
  });

  it('cannot end the session or clear its indicator', () => {
    const state = removed();
    const refused = svc(state, bob, session(sessionId, false), T, cohost);
    expect(refused.status).toBe(403);
    expect(refused.state.selfCapture?.session?.status).toBe('active');
    expect(refused.state.transcriptConsent?.active?.sessionId).toBe(sessionId);
  });
});

describe('the mode after the room ends', () => {
  it('is refused for the host', () => {
    const ended = endMeetRoom(
      selfRoom(),
      new Date(T).toISOString()
    ) as RoomServiceState;
    const refused = svc(
      ended,
      host,
      { action: 'transcript.mode.set', mode: 'room' },
      T
    );
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({ code: 'MEET_ROOM_ENDED' });
    expect(refused.state.selfCapture?.mode).toBe('self');
  });
});
