import { describe, expect, it } from 'vitest';
import {
  applyExternalClassRoom,
  MEET_EXTERNAL_CLASS_SCOPE,
} from './external-class-room';
import { createMeetPresence, createMeetRoomSnapshot } from './room';
import { meetRealtimeTokenPayloadSchema } from './primitives';

const owner = '00000000-0000-4000-8000-000000000001';
const device = '00000000-0000-4000-8000-000000000002';
const token = meetRealtimeTokenPayloadSchema.parse({
  accountId: owner,
  displayName: 'Teacher',
  exp: 10_000,
  meetingId: '00000000-0000-4000-8000-000000000003',
  mode: 'call',
  role: 'host',
  roomId: 'room',
  scopes: ['meet:server', MEET_EXTERNAL_CLASS_SCOPE],
  userId: owner,
  wsId: '00000000-0000-4000-8000-000000000004',
});
const initialize = { action: 'external-class.initialize' };
const status = { action: 'external-class.status' };
const empty = new Set<string>();

describe('external class room service', () => {
  it('sets guest and lobby defaults once and preserves later host edits', () => {
    const result = applyExternalClassRoom(
      createMeetRoomSnapshot(),
      token,
      initialize,
      empty
    );
    expect(result?.state.settings).toMatchObject({
      allowAnonymousGuests: true,
      skipLobby: true,
    });
    if (!result) throw new Error('Initializer did not respond');
    const edited = {
      ...result.state,
      settings: {
        allowAnonymousGuests: false,
        skipLobby: false,
        shareNotes: false,
      },
    };
    expect(
      applyExternalClassRoom(edited, token, initialize, empty)?.state
    ).toBe(edited);
  });

  it('requires the dedicated service scope', () => {
    const state = createMeetRoomSnapshot();
    for (const scopes of [[], ['meet:server'], [MEET_EXTERNAL_CLASS_SCOPE]]) {
      expect(
        applyExternalClassRoom(state, { ...token, scopes }, initialize, empty)
          ?.status
      ).toBe(403);
    }
  });

  it('reports live only with the admitted original host on an open socket', () => {
    const snapshot = createMeetRoomSnapshot();
    const state = {
      ...snapshot,
      externalClassInitialized: true as const,
      presence: {
        [device]: createMeetPresence(
          { ...token, userId: device },
          '2026-11-26T13:00:00Z'
        ),
      },
    };
    const connected = new Set([device]);
    expect(
      applyExternalClassRoom(state, token, status, connected)?.body
    ).toEqual({ live: true });
    expect(applyExternalClassRoom(state, token, status, empty)?.body).toEqual({
      live: false,
    });
    expect(
      applyExternalClassRoom(
        { ...state, ended: true },
        token,
        status,
        connected
      )?.body
    ).toEqual({ live: false });
  });
});
