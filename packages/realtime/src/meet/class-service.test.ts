import { expect, it } from 'vitest';
import { createMeetRoomSnapshot } from './room';
import { applyMeetClassService } from './class-service';
import {
  signMeetServiceCredential,
  verifyMeetServiceCredential,
} from './service-credential';
import { endMeetRoom } from './room-ending';
import { expireRoomBudget } from './room-budget';
import {
  allowMeetActorAction,
  MEET_TIMER_COMMAND_LIMIT,
} from './actor-rate-limit';

const SECRET = 'meet-service-test-secret';
const NOW = '2026-07-31T12:00:00.000Z';
const ROOM = 'ws-a:meeting';
const USER = '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691';

function interval(userId = USER) {
  return {
    sourceKey: `${userId}:${NOW}`,
    deviceUserId: userId,
    kind: 'member' as const,
    userId,
    displayName: 'Ada',
    joinedAt: NOW,
  };
}

it('rejects a tampered or expired service credential', () => {
  const token = signMeetServiceCredential(
    {
      aud: 'meet-service',
      purpose: 'attendance-ledger',
      roomId: ROOM,
      exp: 1_800_000_000,
    },
    SECRET
  );
  expect(
    verifyMeetServiceCredential(token, SECRET, 1_700_000_000_000)?.roomId
  ).toBe(ROOM);
  expect(
    verifyMeetServiceCredential(`${token}x`, SECRET, 1_700_000_000_000)
  ).toBeNull();
  expect(
    verifyMeetServiceCredential(token, SECRET, 1_900_000_000_000)
  ).toBeNull();
  expect(
    verifyMeetServiceCredential(token, 'other-secret', 1_700_000_000_000)
  ).toBeNull();
});

it('does not return the ledger unless attendance is on, and still erases when it is off', () => {
  const snapshot = { ...createMeetRoomSnapshot(), attendance: [interval()] };
  const hidden = applyMeetClassService(
    snapshot,
    {
      aud: 'meet-service',
      purpose: 'attendance-ledger',
      roomId: ROOM,
      exp: 1_800_000_000,
    },
    { attendance: false, timer: true },
    NOW
  );
  expect(hidden.status).toBe(404);
  expect(hidden.persist).toBe(false);
  const erased = applyMeetClassService(
    snapshot,
    {
      aud: 'meet-service',
      purpose: 'attendance-erase',
      roomId: ROOM,
      exp: 1_800_000_000,
      erase: 'subject',
      userId: USER,
    },
    { attendance: false, timer: false },
    NOW
  );
  expect(erased.snapshot.attendance).toEqual([]);
  expect(erased.persist).toBe(true);
});

it('lets a rechecked host start the timer and refuses a co-host pause', () => {
  const snapshot = createMeetRoomSnapshot();
  const started = applyMeetClassService(
    snapshot,
    {
      aud: 'meet-service',
      purpose: 'class-timer',
      roomId: ROOM,
      exp: 1_800_000_000,
      action: 'pause',
      actorUserId: USER,
      actorRole: 'cohost',
    },
    { attendance: false, timer: true },
    NOW
  );
  expect(started.status).toBe(403);
  const running = applyMeetClassService(
    snapshot,
    {
      aud: 'meet-service',
      purpose: 'class-timer',
      roomId: ROOM,
      exp: 1_800_000_000,
      action: 'start',
      durationMs: 60_000,
      actorUserId: USER,
      actorRole: 'cohost',
    },
    { attendance: false, timer: true },
    NOW
  );
  expect(running.snapshot.classTimer).toMatchObject({ status: 'running' });
});

it('closes open attendance when the room ends or the budget expires', () => {
  const open = {
    ...createMeetRoomSnapshot(),
    attendance: [interval()],
    budget: {
      expiresAt: Date.parse(NOW),
      accountedAt: Date.parse(NOW) - 1000,
      participantMilliseconds: 0,
      maxPublishers: 8,
      maxViewers: 8,
    },
  };
  const ended = endMeetRoom(open, NOW, { attendance: true, timer: false });
  expect(ended.attendance?.[0]?.leftAt).toBe(NOW);
  const held = endMeetRoom(open, NOW, { attendance: false, timer: false });
  expect(held.attendance?.[0]?.leftAt).toBeUndefined();
  const expired = expireRoomBudget(open, Date.parse(NOW), {
    attendance: true,
    timer: false,
  });
  expect(expired?.state.attendance?.[0]?.leftAt).toBe(NOW);
});

it('rate-limits timer commands per actor per room', () => {
  const now = 1_700_000_000_000;
  for (let count = 0; count < MEET_TIMER_COMMAND_LIMIT; count += 1)
    expect(allowMeetActorAction('timer', USER, ROOM, now)).toBe(true);
  expect(allowMeetActorAction('timer', USER, ROOM, now)).toBe(false);
  expect(allowMeetActorAction('timer', 'other', ROOM, now)).toBe(true);
  expect(allowMeetActorAction('timer', USER, 'other-room', now)).toBe(true);
});
