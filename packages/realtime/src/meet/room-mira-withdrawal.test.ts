import { beforeEach, describe, expect, it } from 'vitest';
import {
  admitOrHold,
  createMeetRoomSnapshot,
  meetRealtimeTokenPayloadSchema,
} from './index';
import {
  applyMiraRoomConsent,
  fenceMiraRoomRequest,
  MIRA_ROOM_NOTICE_VERSION as version,
  miraRoomFence,
} from './room-mira-consent';
import {
  type RoomChatMessage,
  roomService,
  type RoomServiceState,
} from './room-service';

const alice = '00000000-0000-4000-8000-0000000000a1';
const bob = '00000000-0000-4000-8000-0000000000b2';
const carol = '00000000-0000-4000-8000-0000000000c3';
const meetingId = '00000000-0000-4000-8000-000000000002';
const lease = (n: number) => `00000000-0000-4000-8000-00000000f0${10 + n}`;
const token = (id: string) =>
  meetRealtimeTokenPayloadSchema.parse({
    exp: 2000000000,
    limits: {},
    meetingId,
    mode: 'call',
    role: 'speaker',
    roomId: 'room',
    scopes: ['meet:server'],
    userId: id,
    accountId: id,
    wsId: '00000000-0000-4000-8000-000000000003',
  });

let now = 1_800_000_000_000;
let room: RoomServiceState;
/** One serialized authority, in the meet-realtime wrapper order. */
function act(id: string, input: unknown) {
  const result =
    applyMiraRoomConsent(room, token(id), input, now) ??
    fenceMiraRoomRequest(room, token(id), input, () =>
      roomService(room, token(id), input)
    );
  room = result.state;
  return result;
}
const choose = (id: string, choice: 'continue' | 'mute') =>
  act(id, { action: 'mira.room.choice', choice, version });
const dispatch = (requester: string, messageId: string, n: number) =>
  act(requester, {
    action: 'mira.room.dispatch',
    messageId,
    leaseId: lease(n),
  });
const release = (requester: string, messageId: string, n: number) =>
  act(requester, { action: 'mira.room.release', messageId, leaseId: lease(n) });
const view = (id: string) =>
  act(id, { action: 'mira.room.read' }).body as {
    choice: string | null;
    pausing: boolean;
  };
const message = (id: string, accountId: string, body: string) =>
  ({
    type: 'chat.message',
    id,
    body,
    userId: accountId,
    accountId,
    displayName: accountId,
    createdAt: '2026-11-20T00:00:00Z',
  }) as RoomChatMessage;
const blocked = { status: 409, body: { code: 'MIRA_ROOM_CONSENT_REQUIRED' } };

beforeEach(() => {
  now = 1_800_000_000_000;
  room = createMeetRoomSnapshot();
  for (const id of [alice, bob, carol]) {
    room = admitOrHold(room, token(id), '2026-11-20T00:00:00Z').state;
    choose(id, 'continue');
  }
  // Two requests that both carry Bob's words: Alice's and Carol's.
  room = {
    ...room,
    chat: [
      message('bob-1', bob, 'Bob said something'),
      message('ask-a', alice, '@mira summarize'),
      message('ask-c', carol, '@mira summarize too'),
    ],
  };
  expect(
    act(alice, { action: 'ai.reserve', messageId: 'ask-a' }).status ?? 200
  ).toBe(200);
  expect(
    act(carol, { action: 'ai.reserve', messageId: 'ask-c' }).status ?? 200
  ).toBe(200);
});

describe('deferred room Mira withdrawal', () => {
  it('pauses at once when no admitted send carries the account', () => {
    choose(bob, 'mute');
    expect(view(bob)).toMatchObject({ choice: 'mute', pausing: false });
    expect(room.miraRoom?.choices[bob]?.revision).toBe(2);
  });

  it('refuses every new send after the button, before admission', () => {
    dispatch(alice, 'ask-a', 1);
    choose(bob, 'mute');
    expect(view(bob)).toMatchObject({ choice: 'continue', pausing: true });
    // No new provider send, reservation or publication starts.
    expect(dispatch(alice, 'ask-a', 2)).toMatchObject(blocked);
    expect(dispatch(carol, 'ask-c', 3)).toMatchObject(blocked);
    expect(miraRoomFence(room, meetingId).ready).toBe(false);
    expect(
      act(alice, {
        action: 'ai.finish',
        messageId: 'ask-a',
        body: 'Answer',
        costUsd: 0,
      })
    ).toMatchObject(blocked);
  });

  it('lets a send admitted before the button finish, then makes the Pause effective', () => {
    expect(dispatch(alice, 'ask-a', 1).body).toEqual({
      ok: true,
      leaseId: lease(1),
    });
    choose(bob, 'mute');
    expect(room.miraRoom?.choices[bob]?.choice).toBe('continue');
    // The admitted send settles; its answer is not used after the button.
    expect(release(alice, 'ask-a', 1).body).toEqual({ current: false });
    expect(view(bob)).toMatchObject({ choice: 'mute', pausing: false });
    expect(room.miraRoom?.choices[bob]?.revision).toBe(2);
    expect(room.miraRoom?.pending?.[bob]).toBeUndefined();
  });

  it('waits for every overlapping request that carries the account', () => {
    dispatch(alice, 'ask-a', 1);
    dispatch(carol, 'ask-c', 2);
    choose(bob, 'mute');
    release(alice, 'ask-a', 1);
    // Carol's request still carries Bob's words.
    expect(view(bob)).toMatchObject({ pausing: true });
    release(carol, 'ask-c', 2);
    expect(view(bob)).toMatchObject({ choice: 'mute', pausing: false });
    // Alice and Carol keep their own effective choices.
    expect(room.miraRoom?.choices[alice]?.choice).toBe('continue');
    expect(room.miraRoom?.choices[carol]?.choice).toBe('continue');
  });

  it('becomes effective when an unreleased lease expires', () => {
    dispatch(alice, 'ask-a', 1);
    choose(bob, 'mute');
    now += 119_000;
    expect(view(bob)).toMatchObject({ pausing: true });
    now += 2_000;
    expect(view(bob)).toMatchObject({ choice: 'mute', pausing: false });
  });

  it('releases a lease even after the requester left', () => {
    dispatch(alice, 'ask-a', 1);
    choose(bob, 'mute');
    room = {
      ...room,
      presence: Object.fromEntries(
        Object.entries(room.presence).filter(
          ([, person]) => (person.accountId ?? person.userId) !== alice
        )
      ),
    };
    expect(release(alice, 'ask-a', 1).body).toEqual({ current: false });
    expect(view(bob)).toMatchObject({ choice: 'mute', pausing: false });
  });

  it('cancels a pending Pause with a new revision so earlier requests stay stale', () => {
    dispatch(alice, 'ask-a', 1);
    choose(bob, 'mute');
    choose(bob, 'continue');
    expect(view(bob)).toMatchObject({ choice: 'continue', pausing: false });
    expect(room.miraRoom?.choices[bob]?.revision).toBe(2);
    expect(release(alice, 'ask-a', 1).body).toEqual({ current: false });
    expect(dispatch(alice, 'ask-a', 2)).toMatchObject(blocked);
  });

  it('keeps a repeated Pause idempotent and never lets others choose for Bob', () => {
    dispatch(alice, 'ask-a', 1);
    choose(bob, 'mute');
    const requestedAt = room.miraRoom?.pending?.[bob]?.requestedAt;
    now += 1000;
    choose(bob, 'mute');
    expect(room.miraRoom?.pending?.[bob]?.requestedAt).toBe(requestedAt);
    choose(alice, 'mute');
    expect(room.miraRoom?.choices[bob]?.choice).toBe('continue');
    expect(room.miraRoom?.pending?.[alice]).toBeDefined();
  });
});
