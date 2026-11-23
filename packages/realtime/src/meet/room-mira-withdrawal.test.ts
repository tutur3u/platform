import { beforeEach, describe, expect, it } from 'vitest';
import {
  admitOrHold,
  createMeetRoomSnapshot,
  meetRealtimeTokenPayloadSchema,
} from './index';
import {
  applyMiraRoomConsent,
  fenceMiraRoomRequest,
  miraRoomStatus,
} from './room-mira-consent';
import { acceptMira, miraChoice } from './room-mira.fixtures';
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
const choose = (id: string, choice: 'on' | 'off') =>
  act(id, miraChoice(room, choice));
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
  for (const id of [alice, bob, carol])
    room = admitOrHold(room, token(id), '2026-11-20T00:00:00Z').state;
  room = acceptMira(room, alice, 1, now);
  for (const id of [alice, bob, carol]) choose(id, 'on');
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
    choose(bob, 'off');
    expect(view(bob)).toMatchObject({ choice: 'off', pausing: false });
    expect(room.miraRoom?.choices[bob]?.revision).toBe(2);
  });

  it('refuses every new send after the button, before admission', () => {
    dispatch(alice, 'ask-a', 1);
    choose(bob, 'off');
    expect(view(bob)).toMatchObject({ choice: 'on', pausing: true });
    // No new provider send, reservation or publication starts.
    expect(dispatch(alice, 'ask-a', 2)).toMatchObject(blocked);
    expect(dispatch(carol, 'ask-c', 3)).toMatchObject(blocked);
    // Bob is excluded at once; Alice and Carol keep Mira for their own words.
    expect(miraRoomStatus(room, meetingId)).toEqual({
      active: true,
      included: 2,
      admitted: 3,
    });
    expect(
      act(alice, {
        action: 'ai.finish',
        messageId: 'ask-a',
        body: 'Answer',
        costUsd: 0,
      })
    ).toMatchObject(blocked);
  });

  it('lets a send admitted before the button finish, then makes the opt-out effective', () => {
    expect(dispatch(alice, 'ask-a', 1).body).toEqual({
      ok: true,
      leaseId: lease(1),
      expiresInMs: 120_000,
    });
    choose(bob, 'off');
    expect(room.miraRoom?.choices[bob]?.choice).toBe('on');
    // The admitted send settles; its answer is not used after the button.
    expect(release(alice, 'ask-a', 1).body).toEqual({ current: false });
    expect(view(bob)).toMatchObject({ choice: 'off', pausing: false });
    expect(room.miraRoom?.choices[bob]?.revision).toBe(2);
    expect(room.miraRoom?.pending?.[bob]).toBeUndefined();
  });

  it('waits for every overlapping request that carries the account', () => {
    dispatch(alice, 'ask-a', 1);
    dispatch(carol, 'ask-c', 2);
    choose(bob, 'off');
    release(alice, 'ask-a', 1);
    // Carol's request still carries Bob's words.
    expect(view(bob)).toMatchObject({ pausing: true });
    release(carol, 'ask-c', 2);
    expect(view(bob)).toMatchObject({ choice: 'off', pausing: false });
    // Alice and Carol keep their own effective choices.
    expect(room.miraRoom?.choices[alice]?.choice).toBe('on');
    expect(room.miraRoom?.choices[carol]?.choice).toBe('on');
  });

  it('becomes effective when an unreleased lease expires', () => {
    dispatch(alice, 'ask-a', 1);
    choose(bob, 'off');
    now += 119_000;
    expect(view(bob)).toMatchObject({ pausing: true });
    now += 2_000;
    expect(view(bob)).toMatchObject({ choice: 'off', pausing: false });
  });

  it('releases a lease even after the requester left', () => {
    dispatch(alice, 'ask-a', 1);
    choose(bob, 'off');
    room = {
      ...room,
      presence: Object.fromEntries(
        Object.entries(room.presence).filter(
          ([, person]) => (person.accountId ?? person.userId) !== alice
        )
      ),
    };
    expect(release(alice, 'ask-a', 1).body).toEqual({ current: false });
    expect(view(bob)).toMatchObject({ choice: 'off', pausing: false });
  });

  it('cancels a pending opt-out with a new revision so earlier requests stay stale', () => {
    dispatch(alice, 'ask-a', 1);
    choose(bob, 'off');
    choose(bob, 'on');
    expect(view(bob)).toMatchObject({ choice: 'on', pausing: false });
    expect(room.miraRoom?.choices[bob]?.revision).toBe(2);
    expect(release(alice, 'ask-a', 1).body).toEqual({ current: false });
    expect(dispatch(alice, 'ask-a', 2)).toMatchObject(blocked);
  });

  it('keeps a repeated opt-out idempotent and never lets others choose for Bob', () => {
    dispatch(alice, 'ask-a', 1);
    choose(bob, 'off');
    const requestedAt = room.miraRoom?.pending?.[bob]?.requestedAt;
    now += 1000;
    choose(bob, 'off');
    expect(room.miraRoom?.pending?.[bob]?.requestedAt).toBe(requestedAt);
    choose(alice, 'off');
    expect(room.miraRoom?.choices[bob]?.choice).toBe('on');
    expect(room.miraRoom?.pending?.[alice]).toBeDefined();
  });
});
