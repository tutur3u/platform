import { describe, expect, it } from 'vitest';
import { createMeetRoomSnapshot } from './index';
import { MEET_CLASS_COHOST_SCOPE } from './class-timer';
import { isMeetAiPerSpeakerEnabled } from './per-speaker-gate';
import { applyMeetRoomCommand } from './room-commands';
import type { RoomServiceState } from './room-service';
import {
  admit,
  alice,
  authorize,
  begin,
  bob,
  commit,
  env,
  host,
  ok,
  open,
  otherSession,
  selfRoom,
  sessionId,
  streamA,
  streamB,
  svc,
  tokenOf,
  transcriptChoice,
  ws,
} from './room-self-capture.fixtures';
import { MEET_TRANSCRIPT_NOTICE_VERSION } from './room-transcript-consent';
import { applyTranscription } from './transcription';

const T = 1_000_000;

describe('per-speaker flag', () => {
  it('is on only for the exact value and an allowlisted workspace', () => {
    expect(isMeetAiPerSpeakerEnabled(env, ws)).toBe(true);
    for (const value of ['TRUE', '1', 'yes', ' true', undefined])
      expect(
        isMeetAiPerSpeakerEnabled({ ...env, MEET_AI_PER_SPEAKER: value }, ws)
      ).toBe(false);
    for (const list of ['', 'not-a-uuid', `${ws},nope`, '*'])
      expect(
        isMeetAiPerSpeakerEnabled(
          { ...env, MEET_AI_PER_SPEAKER_WORKSPACES: list },
          ws
        )
      ).toBe(false);
    expect(
      isMeetAiPerSpeakerEnabled({ ...env, MEET_AI_DISABLED: 'true' }, ws)
    ).toBe(false);
  });
});

describe('transcript.mode.set', () => {
  const set = (state: RoomServiceState, id: string, mode: string, extra = {}) =>
    svc(state, id, { action: 'transcript.mode.set', mode }, T, extra);

  it('lets only a host or co-host change the mode', () => {
    let state: RoomServiceState = admit(
      admit(createMeetRoomSnapshot(), host),
      alice
    );
    expect(set(state, alice, 'self').status).toBe(403);
    expect(
      set(state, alice, 'self', { guest: true, role: 'host' }).status
    ).toBe(403);
    const cohost = set(state, alice, 'self', {
      scopes: ['meet:server', MEET_CLASS_COHOST_SCOPE],
    });
    expect(cohost.body).toEqual({ mode: 'self' });
    state = ok(set(state, host, 'room'));
    expect(state.selfCapture?.mode ?? 'room').toBe('room');
  });

  it('refuses the self mode while the room flag is off', () => {
    const state = admit(createMeetRoomSnapshot(), host);
    const refused = svc(
      state,
      host,
      { action: 'transcript.mode.set', mode: 'self' },
      T,
      {},
      { ...env, MEET_AI_PER_SPEAKER: 'false' }
    );
    expect(refused.status).toBe(412);
    expect(refused.body).toMatchObject({ code: 'MEET_SELF_UNAVAILABLE' });
  });

  it('locks the mode while a session is active or draining', () => {
    const state = selfRoom();
    expect(set(state, host, 'room').status).toBe(409);
    const stopped = ok(
      svc(
        state,
        host,
        {
          action: 'transcript.session',
          sessionId,
          active: false,
          protocol: 'self_v1',
        },
        T
      )
    );
    expect(stopped.selfCapture?.session?.status).toBe('draining');
    expect(
      svc(
        stopped,
        host,
        { action: 'transcript.mode.set', mode: 'room' },
        T + 19_000
      ).status
    ).toBe(409);
    expect(
      svc(
        stopped,
        host,
        { action: 'transcript.mode.set', mode: 'room' },
        T + 21_000
      ).body
    ).toEqual({ mode: 'room' });
    // A legacy session locks it too.
    let legacy: RoomServiceState = admit(createMeetRoomSnapshot(), host);
    legacy = ok(
      svc(
        legacy,
        host,
        { action: 'transcript.session', sessionId, active: true },
        T
      )
    );
    expect(set(legacy, host, 'self').status).toBe(409);
  });
});

describe('transcript.session protocol', () => {
  it('refuses a protocol that does not match the mode', () => {
    const state = selfRoom();
    const legacy = svc(
      state,
      host,
      { action: 'transcript.session', sessionId: otherSession, active: true },
      T
    );
    expect(legacy.status).toBe(409);
    expect(legacy.body).toMatchObject({ code: 'MEET_SELF_PROTOCOL_MISMATCH' });
    const roomMode: RoomServiceState = admit(createMeetRoomSnapshot(), host);
    expect(
      svc(
        roomMode,
        host,
        {
          action: 'transcript.session',
          sessionId,
          active: true,
          protocol: 'self_v1',
        },
        T
      ).status
    ).toBe(409);
  });

  it('records the session, protocol and generation', () => {
    const state = selfRoom();
    expect(state.selfCapture?.session).toMatchObject({
      sessionId,
      protocol: 'self_v1',
      generation: 2,
      status: 'active',
    });
    const read = svc(state, alice, { action: 'transcript.consent.read' }, T);
    expect(read.body).toMatchObject({
      mode: 'self',
      session: { sessionId, protocol: 'self_v1', generation: 2 },
      canManageMode: false,
      choice: 'allow',
    });
    expect(
      svc(state, host, { action: 'transcript.consent.read' }, T).body
    ).toMatchObject({ canManageMode: true });
    // Room-mix chunks are refused for a self_v1 session.
    expect(
      svc(state, host, { action: 'transcript.consent.read', sessionId }, T).body
    ).toMatchObject({ sessionActive: false });
  });

  it('refuses client transcription.state and transcription.speaker', () => {
    const state = selfRoom();
    const result = applyTranscription(
      state,
      {
        type: 'transcription.state',
        state: {
          active: true,
          sessionId,
          startedBy: host,
          language: 'auto',
          consentRequired: true,
        },
      },
      tokenOf(host)
    );
    expect(result?.reply[0]).toMatchObject({ error: 'per_speaker_session' });
    expect(
      svc(state, host, { action: 'transcription.speaker', accountId: alice }, T)
        .status
    ).toBe(409);
  });
});

describe('transcription.self commands', () => {
  it('opens a stream through begin and commit, then authorizes chunks', () => {
    let state = selfRoom();
    const begun = begin(state, alice);
    expect(begun.body).toMatchObject({
      allowed: true,
      epoch: 1,
      allowSeq: 1,
      generation: 2,
      pending: [],
    });
    const committed = commit(begun.state, alice, 1, streamA, 4);
    expect(committed.body).toEqual({ committed: true });
    state = committed.state;
    expect(authorize(state, alice, streamA, 4).body).toMatchObject({
      allowed: true,
      generation: 2,
    });
    expect(authorize(state, alice, streamB, 4).body).toMatchObject({
      allowed: false,
      reason: 'stream',
    });
    expect(authorize(state, alice, streamA, 3).body).toMatchObject({
      allowed: false,
      reason: 'stream',
    });
    expect(authorize(state, bob, streamA, 4).body).toMatchObject({
      allowed: false,
      reason: 'stream',
    });
  });

  it('refuses begin without the live fence', () => {
    const state = selfRoom();
    const declined = ok(svc(state, alice, transcriptChoice('decline'), T));
    expect(begin(declined, alice).body).toMatchObject({
      allowed: false,
      reason: 'consent',
    });
    expect(begin(state, alice, T).body.allowed).toBe(true);
    const guest = svc(
      state,
      alice,
      { action: 'transcription.self.openBegin', sessionId },
      T,
      { guest: true }
    );
    expect(guest.body).toMatchObject({ allowed: false, reason: 'guest' });
    expect(
      svc(
        state,
        alice,
        { action: 'transcription.self.openBegin', sessionId: otherSession },
        T
      ).body
    ).toMatchObject({ allowed: false, reason: 'no_session' });
    const flagOff = svc(
      state,
      alice,
      { action: 'transcription.self.openBegin', sessionId },
      T,
      {},
      { ...env, MEET_AI_PER_SPEAKER: 'false' }
    );
    expect(flagOff.body).toMatchObject({
      allowed: false,
      reason: 'unavailable',
    });
    const absent = ok(svc(state, host, { action: 'read' }, T));
    const left = {
      ...absent,
      presence: Object.fromEntries(
        Object.entries(absent.presence).filter(([id]) => id !== alice)
      ),
    };
    expect(begin(left, alice).body).toMatchObject({
      allowed: false,
      reason: 'not_present',
    });
  });

  it('limits opens to burst 3, one per 30 seconds', () => {
    let state = selfRoom();
    for (let i = 0; i < 3; i++) {
      const result = begin(state, alice, T + i);
      expect(result.body.allowed).toBe(true);
      state = result.state;
    }
    expect(begin(state, alice, T + 10).body).toMatchObject({
      allowed: false,
      reason: 'rate_limited',
    });
    expect(begin(state, alice, T + 29_999).body.reason).toBe('rate_limited');
    expect(begin(state, alice, T + 30_000).body.allowed).toBe(true);
    // Another account has its own bucket.
    expect(begin(state, bob, T + 10).body.allowed).toBe(true);
  });

  it('limits chunks to burst 3, one per 10 seconds, and spend=false never spends', () => {
    let state = open(selfRoom(), alice, streamA);
    for (let i = 0; i < 3; i++) {
      const result = authorize(state, alice, streamA, 1, true, T + i);
      expect(result.body.allowed).toBe(true);
      state = result.state;
    }
    expect(authorize(state, alice, streamA, 1, true, T + 5).body).toMatchObject(
      { allowed: false, reason: 'rate_limited' }
    );
    expect(authorize(state, alice, streamA, 1, false, T + 5).body.allowed).toBe(
      true
    );
    expect(
      authorize(state, alice, streamA, 1, false, T + 5).state.selfCapture
        ?.buckets
    ).toEqual(state.selfCapture?.buckets);
    expect(
      authorize(state, alice, streamA, 1, true, T + 10_000).body.allowed
    ).toBe(true);
  });

  it('caps allow decisions at 10 per account per session', () => {
    let state = selfRoom();
    const decline = transcriptChoice('decline');
    const allow = { ...decline, choice: 'allow' };
    let now = T;
    for (let i = 0; i < 10; i++) {
      const begun = begin(state, alice, now);
      expect(begun.body.allowed).toBe(true);
      state = ok(svc(begun.state, alice, decline, now));
      now += 30_000;
      state = ok(svc(state, alice, allow, now));
      now += 30_000;
    }
    expect(begin(state, alice, now).body).toMatchObject({
      allowed: false,
      reason: 'allow_limit',
    });
    expect(
      state.selfCapture?.outbox.filter((e) => e.kind === 'withdraw')
    ).toHaveLength(10);
  });

  it('acknowledges exactly the written entries', () => {
    let state = open(selfRoom(), alice, streamA);
    state = ok(svc(state, alice, transcriptChoice('decline'), T));
    const [entry] = state.selfCapture!.outbox;
    expect(entry).toMatchObject({
      accountId: alice,
      seq: 2,
      kind: 'withdraw',
      noticeVersion: MEET_TRANSCRIPT_NOTICE_VERSION,
    });
    const wrong = svc(
      state,
      bob,
      {
        action: 'transcription.self.ack',
        sessionId,
        entries: [{ accountId: alice, seq: 3 }],
      },
      T
    );
    expect(wrong.state.selfCapture?.outbox).toHaveLength(1);
    const acked = svc(
      state,
      bob,
      {
        action: 'transcription.self.ack',
        sessionId,
        entries: [{ accountId: alice, seq: 2 }],
      },
      T
    );
    expect(acked.body).toEqual({});
    expect(acked.state.selfCapture?.outbox).toEqual([]);
    expect(acked.state.selfCapture?.delivery).toBeUndefined();
  });

  it('refuses commands without the server scope', () => {
    const state = selfRoom();
    const result = svc(
      state,
      alice,
      { action: 'transcription.self.openBegin', sessionId },
      T,
      { scopes: [] }
    );
    expect(result.status).toBe(403);
  });

  it('keeps removal on the websocket path as a revoke', () => {
    const state = open(selfRoom(), alice, streamA);
    const removed = applyMeetRoomCommand(state, {
      message: { type: 'participant.remove', userId: alice },
      now: new Date(T).toISOString(),
      token: { ...tokenOf(host), scopes: ['meet:server'] },
    });
    expect(removed.state.selfCapture?.outbox).toEqual([
      expect.objectContaining({ accountId: alice, seq: 2, kind: 'revoke' }),
    ]);
    expect(removed.state.selfCapture?.accounts[alice]?.revoked).toBe(true);
  });
});
