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
  createMeetRoomSnapshot,
  type MeetRoomOutcome,
  type MeetRoomSnapshot,
  releaseParticipant,
} from './room';
import { MEET_RENAMES_PER_MINUTE, RENAME_RATE_LIMITED } from './room-rename';

const now = '2026-11-23T09:00:00.000Z';
const memberId = '6f0e1e0e-91a4-4c51-9c5a-7a8f3c1b2d40';
const media = { audioEnabled: true, screenEnabled: false, videoEnabled: false };

/** Each test gets its own room, so the in-memory buckets never overlap. */
function fixture(admission: 'open' | 'lobby' = 'open') {
  const token = meetRealtimeTokenPayloadSchema.parse({
    role: 'speaker',
    admission,
    userId: memberId,
    accountId: memberId,
    displayName: 'Member',
    roomId: `presence-rename-${Math.random()}`,
    meetingId: '5e5217de-9bb3-4e20-8d99-526ad3e7e34f',
    wsId: '0f1a64f7-780f-4d30-9d72-5530f204e95c',
    exp: 2_000_000_000,
    limits: {},
    scopes: getMeetRealtimeScopesForRole('speaker'),
  });
  let state: MeetRoomSnapshot = createMeetRoomSnapshot();
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
  const send = (message: MeetRealtimeClientMessage) =>
    executor.run({ message, token, now }, options);
  return {
    token,
    send,
    results,
    admit: () => {
      state = admitOrHold(state, token, now).state;
    },
    leave: () => {
      state = releaseParticipant(state, memberId, token.roomId).state;
    },
    get state() {
      return state;
    },
  };
}
const join = (displayName?: string): MeetRealtimeClientMessage =>
  meetRealtimeClientMessageSchema.parse({
    type: 'presence.join',
    media,
    ...(displayName ? { displayName } : {}),
  });
const rename = (displayName: string, requestId: string) =>
  meetRealtimeClientMessageSchema.parse({
    type: 'participant.rename',
    displayName,
    requestId,
  });

describe('presence.join renames share the participant.rename limit', () => {
  it('limits joins that change the name, keeping the name and applying media', async () => {
    const room = fixture();
    room.admit();
    for (let index = 0; index < MEET_RENAMES_PER_MINUTE; index += 1)
      await room.send(join(`Name ${index}`));
    expect(room.state.presence[memberId]?.displayName).toBe(
      `Name ${MEET_RENAMES_PER_MINUTE - 1}`
    );
    expect(room.results.flatMap((result) => result.reply)).toEqual([]);
    await room.send(join('One too many'));
    expect(room.results.at(-1)?.reply).toEqual([
      { type: 'error', error: RENAME_RATE_LIMITED },
    ]);
    expect(room.state.presence[memberId]?.displayName).toBe(
      `Name ${MEET_RENAMES_PER_MINUTE - 1}`
    );
    expect(room.state.presence[memberId]?.media.audioEnabled).toBe(true);
  });

  it('spends one bucket across both rename paths', async () => {
    const room = fixture();
    room.admit();
    for (let index = 0; index < MEET_RENAMES_PER_MINUTE; index += 1)
      await room.send(join(`Name ${index}`));
    await room.send(rename('Via rename', 'r-1'));
    expect(room.results.at(-1)?.reply).toEqual([
      { type: 'error', error: RENAME_RATE_LIMITED, requestId: 'r-1' },
    ]);
  });

  it('keeps first joins free even with the bucket spent', async () => {
    const room = fixture();
    room.admit();
    for (let index = 0; index <= MEET_RENAMES_PER_MINUTE; index += 1)
      await room.send(join(`Name ${index}`));
    room.leave();
    await room.send(join('Fresh'));
    expect(room.results.at(-1)?.reply).toEqual([]);
    expect(room.state.presence[memberId]?.displayName).toBe('Fresh');
  });

  it('keeps same-name rejoins unlimited, with or without a name', async () => {
    const room = fixture();
    room.admit();
    for (let index = 0; index < MEET_RENAMES_PER_MINUTE * 3; index += 1)
      await room.send(join(index % 2 ? 'Member' : undefined));
    expect(room.results.flatMap((result) => result.reply)).toEqual([]);
    expect(room.state.presence[memberId]?.displayName).toBe('Member');
  });

  it('never charges a lobby join, whose name the host approves', async () => {
    const room = fixture('lobby');
    room.admit();
    for (let index = 0; index < MEET_RENAMES_PER_MINUTE * 2; index += 1)
      await room.send(join(`Name ${index}`));
    expect(room.results.flatMap((result) => result.reply)).toEqual([]);
  });
});
