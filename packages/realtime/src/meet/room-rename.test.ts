import { describe, expect, it } from 'vitest';
import { MeetCommandExecutor } from './command-executor';
import {
  type MeetRealtimeClientMessage,
  meetRealtimeClientMessageSchema,
} from './messages';
import { getMeetRealtimeScopesForRole } from './permissions';
import { meetRealtimeTokenPayloadSchema } from './primitives';
import {
  admitOrHold,
  applyMeetRoomCommand,
  createMeetRoomSnapshot,
  type MeetRoomOutcome,
  type MeetRoomSnapshot,
} from './room';
import {
  DISPLAY_NAME_LOCKED,
  MEET_RENAMES_PER_MINUTE,
  RENAME_RATE_LIMITED,
} from './room-rename';

const now = '2026-11-23T09:00:00.000Z';
const hostId = '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691';
const memberId = '6f0e1e0e-91a4-4c51-9c5a-7a8f3c1b2d40';
const lobbyId = '4b320da6-6c8a-43fe-b1bf-09fbe77303f9';
const token = (
  userId: string,
  role: 'host' | 'speaker',
  extra: Record<string, unknown> = {}
) =>
  meetRealtimeTokenPayloadSchema.parse({
    role,
    admission: 'open',
    userId,
    accountId: userId,
    displayName: `${role} ${userId.slice(0, 4)}`,
    roomId: 'rename-room',
    meetingId: '5e5217de-9bb3-4e20-8d99-526ad3e7e34f',
    wsId: '0f1a64f7-780f-4d30-9d72-5530f204e95c',
    exp: 2_000_000_000,
    limits: {},
    scopes: getMeetRealtimeScopesForRole(role),
    ...extra,
  });
const host = token(hostId, 'host');
const member = token(memberId, 'speaker');
const lobby = token(lobbyId, 'speaker', { admission: 'lobby' });

const rename = (displayName: string, requestId = 'rename-1') =>
  meetRealtimeClientMessageSchema.parse({
    type: 'participant.rename',
    displayName,
    requestId,
  });
const run = (
  state: MeetRoomSnapshot,
  message: MeetRealtimeClientMessage,
  as = member
) => applyMeetRoomCommand(state, { message, token: as, now });

function room() {
  let state = admitOrHold(createMeetRoomSnapshot(), host, now).state;
  state = admitOrHold(state, member, now).state;
  return state;
}

describe('participant.rename', () => {
  it('renames the sender and broadcasts the updated presence', () => {
    const result = run(room(), rename('  Alex   Nguyen '));
    expect(result.state.presence[memberId]?.displayName).toBe('Alex Nguyen');
    expect(result.reply).toEqual([
      {
        type: 'participant.renamed',
        displayName: 'Alex Nguyen',
        requestId: 'rename-1',
        userId: memberId,
      },
    ]);
    const presence = result.broadcast.find(
      (entry) => entry.type === 'presence'
    );
    expect(
      presence?.type === 'presence' &&
        presence.presence.find((entry) => entry.userId === memberId)
          ?.displayName
    ).toBe('Alex Nguyen');
  });

  it('ignores a supplied target and never renames anyone else', () => {
    const message = meetRealtimeClientMessageSchema.parse({
      type: 'participant.rename',
      displayName: 'Hijack',
      userId: hostId,
      requestId: 'rename-2',
    });
    const result = run(room(), message);
    expect(result.state.presence[hostId]?.displayName).toBe(host.displayName);
    expect(result.state.presence[memberId]?.displayName).toBe('Hijack');
  });

  it('keeps media and join time intact', () => {
    const state = run(room(), {
      type: 'presence.update',
      media: { audioEnabled: true, screenEnabled: false, videoEnabled: true },
    }).state;
    const renamed = run(state, rename('Alex')).state.presence[memberId];
    expect(renamed?.media).toEqual(state.presence[memberId]?.media);
    expect(renamed?.joinedAt).toBe(state.presence[memberId]?.joinedAt);
  });

  it('acknowledges an unchanged name without a broadcast', () => {
    const state = run(room(), rename('Alex')).state;
    const again = run(state, rename('Alex', 'rename-3'));
    expect(again.state).toBe(state);
    expect(again.broadcast).toEqual([]);
    expect(again.reply[0]).toMatchObject({ type: 'participant.renamed' });
  });

  it('rejects empty, control-only and oversized names in the schema', () => {
    for (const displayName of ['', '   ', '\u0000\u202e', 'x'.repeat(121)])
      expect(
        meetRealtimeClientMessageSchema.safeParse({
          type: 'participant.rename',
          displayName,
        }).success
      ).toBe(false);
    expect(rename('A\u0000\u202elex')).toMatchObject({ displayName: 'Alex' });
  });

  it('keeps the host-approved name for lobby admissions and guests', () => {
    let state = room();
    state = admitOrHold(state, lobby, now).state;
    state = run(
      state,
      { type: 'admission.decide', userId: lobbyId, admit: true },
      host
    ).state;
    const lobbyResult = run(state, rename('Changed'), lobby);
    expect(lobbyResult.reply).toEqual([
      { type: 'error', error: DISPLAY_NAME_LOCKED, requestId: 'rename-1' },
    ]);
    expect(lobbyResult.state.presence[lobbyId]?.displayName).toBe(
      state.presence[lobbyId]?.displayName
    );
    const guest = {
      ...lobby,
      guest: true as const,
      admission: 'open' as const,
    };
    expect(run(state, rename('Changed'), guest).reply[0]).toMatchObject({
      error: DISPLAY_NAME_LOCKED,
    });
  });

  it('refuses a participant who is not in the room', () => {
    const state = admitOrHold(createMeetRoomSnapshot(), host, now).state;
    expect(run(state, rename('Alex')).reply[0]).toMatchObject({
      type: 'error',
      requestId: 'rename-1',
    });
  });

  it('renames the open attendance row when attendance is collected', () => {
    const features = { attendance: true, timer: false };
    let state = admitOrHold(
      createMeetRoomSnapshot(),
      host,
      now,
      features
    ).state;
    state = admitOrHold(state, member, now, features).state;
    const renamed = applyMeetRoomCommand(state, {
      message: rename('Alex'),
      token: member,
      now,
      classFeatures: features,
    }).state;
    const open = renamed.attendance?.find(
      (row) => row.deviceUserId === memberId && !row.leftAt
    );
    expect(state.attendance?.length).toBeGreaterThan(0);
    expect(open?.displayName).toBe('Alex');
  });
});

describe('participant.rename rate limit', () => {
  it('answers renames past the per-minute limit with a correlated error', async () => {
    let state = room();
    const results: MeetRoomOutcome[] = [];
    const executor = new MeetCommandExecutor();
    const options = {
      read: () => state,
      commit: (result: MeetRoomOutcome) => {
        state = result.state;
        results.push(result);
      },
      runSfu: async () => ({}),
    };
    const limited = {
      ...member,
      roomId: `rename-limit-${Math.random()}`,
    };
    for (let index = 0; index <= MEET_RENAMES_PER_MINUTE; index += 1)
      await executor.run(
        { message: rename(`Alex ${index}`, `r-${index}`), token: limited, now },
        options
      );
    expect(results.at(-1)?.reply).toEqual([
      {
        type: 'error',
        requestId: `r-${MEET_RENAMES_PER_MINUTE}`,
        error: RENAME_RATE_LIMITED,
      },
    ]);
    expect(state.presence[memberId]?.displayName).toBe(
      `Alex ${MEET_RENAMES_PER_MINUTE - 1}`
    );
  });
});
