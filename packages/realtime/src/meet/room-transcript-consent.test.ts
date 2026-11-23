import { describe, expect, it } from 'vitest';
import {
  admitOrHold,
  createMeetRoomSnapshot,
  meetRealtimeTokenPayloadSchema,
} from './index';
import type { RoomServiceState } from './room-service';
import {
  applyMeetTranscriptConsent,
  meetTranscriptFence,
  MEET_TRANSCRIPT_NOTICE_VERSION as version,
} from './room-transcript-consent';

const host = '00000000-0000-4000-8000-0000000000a1';
const guest = '00000000-0000-4000-8000-0000000000b2';
const meetingId = '00000000-0000-4000-8000-000000000002';
const sessionId = '00000000-0000-4000-8000-0000000000c3';
const token = (id: string, scopes = ['meet:server']) =>
  meetRealtimeTokenPayloadSchema.parse({
    exp: 2000000000,
    limits: {},
    meetingId,
    mode: 'call',
    role: 'speaker',
    roomId: 'room',
    scopes,
    userId: id,
    accountId: id,
    wsId: '00000000-0000-4000-8000-000000000003',
  });
const admit = (state: RoomServiceState, id: string) =>
  admitOrHold(state, token(id), '2026-11-23T00:00:00Z').state;
const run = (state: RoomServiceState, id: string, input: object) =>
  applyMeetTranscriptConsent(state, token(id), input, 1000)!;
const choose = (
  state: RoomServiceState,
  id: string,
  choice: 'allow' | 'decline'
) => run(state, id, { action: 'transcript.consent.choice', choice, version });

describe('meeting transcript all-participant fence', () => {
  it('waits for every admitted account, guests included', () => {
    let state: RoomServiceState = admit(createMeetRoomSnapshot(), host);
    expect(meetTranscriptFence(state, meetingId)).toEqual({
      ready: false,
      pending: 1,
      declined: 0,
      admitted: 1,
    });
    state = choose(state, host, 'allow').state;
    expect(meetTranscriptFence(state, meetingId).ready).toBe(true);
    state = admit(state, guest);
    expect(meetTranscriptFence(state, meetingId)).toEqual({
      ready: false,
      pending: 1,
      declined: 0,
      admitted: 2,
    });
    state = choose(state, guest, 'allow').state;
    expect(meetTranscriptFence(state, meetingId).ready).toBe(true);
  });

  it('pauses for everyone when one participant declines', () => {
    let state: RoomServiceState = admit(
      admit(createMeetRoomSnapshot(), host),
      guest
    );
    state = choose(state, host, 'allow').state;
    const declined = choose(state, guest, 'decline');
    expect(declined.body).toMatchObject({
      choice: 'decline',
      fence: { ready: false, pending: 1, declined: 1, admitted: 2 },
    });
    // Changing back records a new revision.
    const allowed = choose(declined.state, guest, 'allow').state;
    expect(allowed.transcriptConsent?.choices[guest]?.revision).toBe(2);
    expect(meetTranscriptFence(allowed, meetingId).ready).toBe(true);
  });

  it('ignores choices for another notice version or meeting', () => {
    let state: RoomServiceState = admit(createMeetRoomSnapshot(), host);
    state = choose(state, host, 'allow').state;
    const stale: RoomServiceState = {
      ...state,
      transcriptConsent: {
        choices: {
          [host]: {
            ...state.transcriptConsent!.choices[host]!,
            version: '2026-01-01-transcript-v0',
          },
        },
      },
    };
    expect(meetTranscriptFence(stale, meetingId).ready).toBe(false);
    expect(meetTranscriptFence(state, 'another-meeting').ready).toBe(false);
  });

  it('rejects a choice for a different notice version', () => {
    const state = admit(createMeetRoomSnapshot(), host);
    expect(
      applyMeetTranscriptConsent(state, token(host), {
        action: 'transcript.consent.choice',
        choice: 'allow',
        version: 'old',
      })
    ).toBeNull();
  });

  it('only accepts server-issued commands from admitted accounts', () => {
    const state = admit(createMeetRoomSnapshot(), host);
    expect(
      applyMeetTranscriptConsent(state, token(host, ['meet:join']), {
        action: 'transcript.consent.read',
      })
    ).toMatchObject({ status: 403 });
    expect(
      run(state, guest, { action: 'transcript.consent.read' })
    ).toMatchObject({ status: 403 });
    expect(
      run({ ...state, ended: true }, host, {
        action: 'transcript.consent.read',
      })
    ).toMatchObject({ status: 403 });
  });

  it('tracks the host session for the recording indicator', () => {
    const state = admit(admit(createMeetRoomSnapshot(), host), guest);
    const started = run(state, host, {
      action: 'transcript.session',
      sessionId,
      active: true,
    });
    expect(
      run(started.state, guest, { action: 'transcript.consent.read' })
    ).toMatchObject({ body: { active: true, activeSince: 1000 } });
    // Another account cannot clear the host's indicator.
    const other = run(started.state, guest, {
      action: 'transcript.session',
      sessionId,
      active: false,
    });
    expect(other.state.transcriptConsent?.active?.sessionId).toBe(sessionId);
    // The host can always end it, even after leaving the room.
    const left: RoomServiceState = { ...started.state, presence: {} };
    const ended = run(left, host, {
      action: 'transcript.session',
      sessionId,
      active: false,
    });
    expect(ended.state.transcriptConsent?.active).toBeUndefined();
  });

  it('refuses to start the indicator for someone outside the room', () => {
    const state = admit(createMeetRoomSnapshot(), host);
    expect(
      run(state, guest, {
        action: 'transcript.session',
        sessionId,
        active: true,
      })
    ).toMatchObject({ status: 403 });
  });

  it('passes other commands through', () => {
    expect(
      applyMeetTranscriptConsent(createMeetRoomSnapshot(), token(host), {
        action: 'read',
      })
    ).toBeNull();
  });

  it('checks every attributed chunk source, even after they left', () => {
    let state: RoomServiceState = admit(
      admit(createMeetRoomSnapshot(), host),
      guest
    );
    state = choose(state, host, 'allow').state;
    const read = (accounts: string[]) =>
      run(state, host, { action: 'transcript.consent.read', accounts }).body;
    expect(read([host])).toMatchObject({ sourcesAllowed: true });
    expect(read([host, guest])).toMatchObject({ sourcesAllowed: false });
    state = choose(state, guest, 'allow').state;
    state = { ...state, presence: { ...state.presence } };
    for (const [key, person] of Object.entries(state.presence))
      if ((person.accountId ?? person.userId) === guest)
        delete state.presence[key];
    expect(read([host, guest])).toMatchObject({ sourcesAllowed: true });
  });

  it('reports whether a chunk belongs to the running recording', () => {
    const state = admit(createMeetRoomSnapshot(), host);
    const other = '00000000-0000-4000-8000-0000000000c4';
    const read = (current: RoomServiceState, id: string) =>
      run(current, host, { action: 'transcript.consent.read', sessionId: id })
        .body;
    expect(read(state, sessionId)).toMatchObject({ sessionActive: false });
    const started = run(state, host, {
      action: 'transcript.session',
      sessionId,
      active: true,
    }).state;
    expect(read(started, sessionId)).toMatchObject({ sessionActive: true });
    expect(read(started, other)).toMatchObject({ sessionActive: false });
  });
});
