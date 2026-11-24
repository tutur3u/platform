import { describe, expect, it } from 'vitest';
import { createMeetRoomSnapshot } from './index';
import { isCurrentMiraRoomOn } from './room-mira-choices';
import { acceptMira, miraChoice } from './room-mira.fixtures';
import type { RoomServiceState } from './room-service';
import {
  admit,
  alice,
  begin,
  host,
  miraOn,
  ok,
  sessionId,
  svc,
  transcriptChoice,
} from './room-self-capture.fixtures';

const T = 1_000_000;
const meetingId = '00000000-0000-4000-8000-000000000002';
const choose = (
  state: RoomServiceState,
  choice: 'on' | 'off',
  noticeMode?: 'room' | 'self'
) =>
  svc(
    state,
    alice,
    { ...miraChoice(state, choice), ...(noticeMode ? { noticeMode } : {}) },
    T
  );
const mode = (state: RoomServiceState, next: 'room' | 'self') =>
  ok(svc(state, host, { action: 'transcript.mode.set', mode: next }, T));
const session = (sid: string, active: boolean) => ({
  action: 'transcript.session',
  sessionId: sid,
  active,
  protocol: 'self_v1',
  generation: 1,
});
const fence = (state: RoomServiceState) =>
  (
    svc(state, host, { action: 'transcript.consent.read' }, T).body as {
      fence: unknown;
    }
  ).fence;
/** Whether a room-mix chunk with both voices may reach the provider. */
const sources = (state: RoomServiceState) =>
  (
    svc(
      state,
      host,
      { action: 'transcript.consent.read', accounts: [host, alice] },
      T
    ).body as { sourcesAllowed: boolean }
  ).sourcesAllowed;
const view = (state: RoomServiceState) =>
  svc(state, alice, { action: 'mira.room.read' }, T).body as {
    noticeMode: string;
    noticeStale: boolean;
  };

/** Host and Alice present with room Mira accepted, in room capture mode. */
function room() {
  let state: RoomServiceState = createMeetRoomSnapshot();
  for (const id of [host, alice]) state = admit(state, id);
  return acceptMira(state, host, 1, T - 90_000);
}

describe('the notice mode of a Mira choice', () => {
  it('refuses an on given under the other mode in the same turn', () => {
    const roomMode = room();
    expect(choose(roomMode, 'on', 'self')).toMatchObject({
      status: 409,
      body: { code: 'MIRA_ROOM_NOTICE_MODE_STALE' },
    });
    expect(choose(roomMode, 'on').status).toBeUndefined();
    const selfMode = mode(roomMode, 'self');
    // Absent means the room notice.
    expect(choose(selfMode, 'on')).toMatchObject({
      status: 409,
      body: { code: 'MIRA_ROOM_NOTICE_MODE_STALE' },
    });
    expect(choose(selfMode, 'on', 'room').status).toBe(409);
    const on = ok(choose(selfMode, 'on', 'self'));
    expect(on.miraRoom?.choices[alice]?.noticeMode).toBe('self');
  });

  it('never refuses off', () => {
    const roomMode = ok(choose(room(), 'on'));
    const selfMode = mode(roomMode, 'self');
    for (const [state, noticeMode] of [
      [roomMode, 'self'],
      [selfMode, 'room'],
      [selfMode, undefined],
    ] as const) {
      const off = choose(state, 'off', noticeMode);
      expect(off.status).toBeUndefined();
      expect(off.state.miraRoom?.choices[alice]?.choice).toBe('off');
    }
  });
});

describe('a change from room capture to per-speaker mode', () => {
  it('needs Mira confirmed again under the per-speaker notice', () => {
    let state = ok(choose(room(), 'on'));
    state = miraOn(state, host, T);
    state = ok(svc(state, alice, transcriptChoice('allow'), T));
    state = mode(state, 'self');
    // Room Mira chat keeps working for the earlier on.
    expect(isCurrentMiraRoomOn(state, meetingId, alice)).toBe(true);
    expect(view(state)).toMatchObject({
      noticeMode: 'self',
      noticeStale: true,
    });
    state = ok(svc(state, host, session(sessionId, true), T));
    // Per-speaker capture refuses until the participant confirms again.
    const refused = begin(state, alice, T);
    expect(refused.body).toMatchObject({
      allowed: false,
      reason: 'notice_required',
    });
    // A transcript Allow under the new notice needs Mira on under it first.
    expect(
      svc(refused.state, alice, transcriptChoice('allow'), T)
    ).toMatchObject({
      status: 409,
      body: { code: 'MIRA_ROOM_NOTICE_MODE_STALE' },
    });
    const revision = state.miraRoom!.choices[alice]!.revision;
    state = ok(choose(refused.state, 'on', 'self'));
    // The same on under a new notice is a new choice.
    expect(state.miraRoom?.choices[alice]?.revision).toBe(revision + 1);
    expect(view(state)).toMatchObject({ noticeStale: false });
    state = ok(svc(state, alice, transcriptChoice('allow'), T));
    expect(begin(state, alice, T).body).toMatchObject({ allowed: true });
  });

  it('a repeated on under the same notice changes nothing', () => {
    const state = mode(room(), 'self');
    const on = ok(choose(state, 'on', 'self'));
    expect(ok(choose(on, 'on', 'self')).miraRoom?.choices[alice]).toEqual(
      on.miraRoom?.choices[alice]
    );
  });
});

describe('a change from per-speaker mode to room capture', () => {
  it('pauses room capture until Mira is confirmed under the room notice', () => {
    let state = mode(room(), 'self');
    for (const id of [host, alice]) {
      state = miraOn(state, id, T);
      state = ok(svc(state, id, transcriptChoice('allow'), T));
    }
    expect(fence(state)).toMatchObject({ ready: true });
    state = mode(state, 'room');
    // Both are undecided for room capture; room Mira chat still counts them.
    expect(fence(state)).toMatchObject({
      ready: false,
      pending: 2,
      declined: 0,
    });
    expect(isCurrentMiraRoomOn(state, meetingId, alice)).toBe(true);
    expect(view(state)).toMatchObject({
      noticeMode: 'room',
      noticeStale: true,
    });
    expect(sources(state)).toBe(false);
    // A new Allow waits for Mira under the room notice.
    expect(svc(state, alice, transcriptChoice('allow'), T)).toMatchObject({
      status: 409,
      body: { code: 'MIRA_ROOM_NOTICE_MODE_STALE' },
    });
    state = miraOn(state, host, T);
    expect(fence(state)).toMatchObject({ ready: false, pending: 1 });
    state = miraOn(state, alice, T);
    expect(fence(state)).toMatchObject({ ready: true, pending: 0 });
    expect(sources(state)).toBe(true);
    expect(view(state)).toMatchObject({ noticeStale: false });
  });
});

describe('re-confirming after a mode change', () => {
  it('a refused Allow costs no choice token', () => {
    let state = ok(choose(room(), 'on'));
    state = miraOn(state, host, T);
    state = ok(svc(state, alice, transcriptChoice('allow'), T));
    state = ok(svc(mode(state, 'self'), host, session(sessionId, true), T));
    const refused = begin(state, alice, T);
    expect(refused.body).toMatchObject({ reason: 'notice_required' });
    const before = refused.state.selfCapture?.buckets;
    const early = svc(refused.state, alice, transcriptChoice('allow'), T);
    expect(early.status).toBe(409);
    expect(early.state.selfCapture?.buckets).toEqual(before);
    state = ok(choose(early.state, 'on', 'self'));
    state = ok(svc(state, alice, transcriptChoice('allow'), T));
    expect(begin(state, alice, T).body).toMatchObject({ allowed: true });
  });
});

describe('switching the mode back', () => {
  it('makes an earlier on under the room notice valid again', () => {
    let state = room();
    for (const id of [host, alice]) {
      state = miraOn(state, id, T);
      state = ok(svc(state, id, transcriptChoice('allow'), T));
    }
    expect(fence(state)).toMatchObject({ ready: true });
    state = mode(mode(state, 'self'), 'room');
    expect(fence(state)).toMatchObject({ ready: true });
    expect(view(state)).toMatchObject({ noticeStale: false });
  });

  it('makes an earlier on under the per-speaker notice valid again', () => {
    let state = mode(room(), 'self');
    state = miraOn(state, host, T);
    state = miraOn(state, alice, T);
    state = ok(svc(state, alice, transcriptChoice('allow'), T));
    state = mode(mode(state, 'room'), 'self');
    expect(view(state)).toMatchObject({ noticeStale: false });
    state = ok(svc(state, host, session(sessionId, true), T));
    expect(begin(state, alice, T).body).toMatchObject({ allowed: true });
  });
});
