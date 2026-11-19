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
  MEET_ATTENDANCE_READ_LIMIT,
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
  expect(hidden.body).toBeNull();
  expect(hidden.persist).toBe(true);
  expect(hidden.snapshot.attendance?.[0]?.leftAt).toBe(NOW);
  const erased = applyMeetClassService(
    snapshot,
    {
      aud: 'meet-service',
      purpose: 'attendance-erase',
      roomId: ROOM,
      exp: 1_800_000_000,
      erase: 'subject',
      userId: USER,
      generation: 1,
    },
    { attendance: false, timer: false },
    NOW
  );
  expect(erased.snapshot.attendance).toEqual([]);
  expect(erased.snapshot.attendanceEpoch).toBe(1);
  expect(erased.persist).toBe(true);
});

it('sets the epoch from the erasure generation and does not store a missing room', () => {
  const claims = {
    aud: 'meet-service' as const,
    purpose: 'attendance-erase' as const,
    roomId: ROOM,
    exp: 1_800_000_000,
    erase: 'meeting' as const,
    generation: 1,
  };
  const snapshot = { ...createMeetRoomSnapshot(), attendance: [interval()] };
  const once = applyMeetClassService(
    snapshot,
    claims,
    { attendance: false, timer: false },
    NOW
  );
  const twice = applyMeetClassService(
    once.snapshot,
    claims,
    { attendance: false, timer: false },
    NOW
  );
  expect(twice.snapshot.attendanceEpoch).toBe(1);
  expect(twice.persist).toBe(false);
  const raised = applyMeetClassService(
    twice.snapshot,
    { ...claims, generation: 4 },
    { attendance: false, timer: false },
    NOW
  );
  const older = applyMeetClassService(
    raised.snapshot,
    { ...claims, generation: 2 },
    { attendance: false, timer: false },
    NOW
  );
  expect(older.snapshot.attendanceEpoch).toBe(4);
  expect(older.persist).toBe(false);
  const missing = applyMeetClassService(
    createMeetRoomSnapshot(),
    { ...claims, generation: undefined },
    { attendance: false, timer: false },
    NOW
  );
  expect(missing.status).toBe(400);
  expect(missing.persist).toBe(false);
  const empty = createMeetRoomSnapshot();
  const fenced = applyMeetClassService(
    empty,
    { ...claims, generation: 5 },
    { attendance: false, timer: false },
    NOW,
    true
  );
  expect(fenced.persist).toBe(true);
  expect(fenced.snapshot.attendanceEpoch).toBe(5);
  const absent = applyMeetClassService(
    snapshot,
    claims,
    { attendance: false, timer: false },
    NOW,
    false
  );
  expect(absent.status).toBe(200);
  expect(absent.body).toEqual({ ok: true, absent: true });
  expect(absent.persist).toBe(false);
  expect(absent.snapshot).toBe(snapshot);
  expect(snapshot.attendance?.[0]).not.toHaveProperty('leftAt');
  const unsigned = signMeetServiceCredential(
    {
      aud: 'meet-service',
      purpose: 'attendance-erase',
      roomId: ROOM,
      exp: 1_800_000_000,
      erase: 'meeting',
    },
    SECRET
  );
  expect(
    verifyMeetServiceCredential(unsigned, SECRET, 1_700_000_000_000)
  ).toBeNull();
  const signed = signMeetServiceCredential(claims, SECRET);
  expect(
    verifyMeetServiceCredential(signed, SECRET, 1_700_000_000_000)?.generation
  ).toBe(1);
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
  expect(held.attendance?.[0]?.leftAt).toBe(NOW);
  const expiredWhileOff = expireRoomBudget(open, Date.parse(NOW), {
    attendance: false,
    timer: true,
  });
  expect(expiredWhileOff?.state.attendance?.[0]?.leftAt).toBe(NOW);
  expect(expiredWhileOff?.state.ended).toBe(true);
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

function hostStart(actorUserId = USER) {
  return {
    aud: 'meet-service' as const,
    purpose: 'class-timer' as const,
    roomId: ROOM,
    exp: 1_800_000_000,
    action: 'start' as const,
    durationMs: 60_000,
    actorUserId,
    actorRole: 'host' as const,
  };
}

it('does not start the timer after the room has ended or the deadline has passed', () => {
  const ended = { ...createMeetRoomSnapshot(), ended: true };
  const refused = applyMeetClassService(
    ended,
    hostStart(),
    { attendance: false, timer: true },
    NOW
  );
  expect(refused.status).toBe(403);
  expect(refused.body).toEqual({ error: 'room.ended' });
  expect(refused.snapshot.classTimer).toBeUndefined();

  const budget = {
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
  const expired = applyMeetClassService(
    budget,
    hostStart(),
    { attendance: false, timer: true },
    NOW
  );
  expect(expired.status).toBe(403);
  expect(expired.body).toEqual({ error: 'room.ended' });
  expect(expired.persist).toBe(true);
  expect(expired.broadcast).toEqual([{ type: 'room.ended' }]);
  expect(expired.snapshot.classTimer).toBeUndefined();
  expect(expired.snapshot.ended).toBe(true);
  expect(expired.snapshot.attendance?.[0]?.leftAt).toBe(NOW);
});

it('keeps the room rate limit on the snapshot, not a shared isolate map', () => {
  let snapshot = createMeetRoomSnapshot();
  for (let count = 0; count < MEET_TIMER_COMMAND_LIMIT; count += 1) {
    const allowed = applyMeetClassService(
      snapshot,
      hostStart(),
      { attendance: false, timer: true },
      NOW
    );
    expect(allowed.status).toBe(200);
    snapshot = allowed.snapshot;
  }
  const blocked = applyMeetClassService(
    snapshot,
    hostStart(),
    { attendance: false, timer: true },
    NOW
  );
  expect(blocked.status).toBe(429);
  expect(blocked.snapshot.classTimer).toEqual(snapshot.classTimer);
  const otherRoomCopy = applyMeetClassService(
    createMeetRoomSnapshot(),
    hostStart(),
    { attendance: false, timer: true },
    NOW
  );
  expect(otherRoomCopy.status).toBe(200);

  let reads = createMeetRoomSnapshot();
  const ledger = {
    aud: 'meet-service' as const,
    purpose: 'attendance-ledger' as const,
    roomId: ROOM,
    exp: 1_800_000_000,
    actorUserId: USER,
  };
  for (let count = 0; count < MEET_ATTENDANCE_READ_LIMIT; count += 1) {
    const allowed = applyMeetClassService(
      reads,
      ledger,
      { attendance: true, timer: true },
      NOW
    );
    expect(allowed.status).toBe(200);
    reads = allowed.snapshot;
  }
  expect(
    applyMeetClassService(reads, ledger, { attendance: true, timer: true }, NOW)
      .status
  ).toBe(429);
  expect(
    applyMeetClassService(
      createMeetRoomSnapshot(),
      ledger,
      { attendance: true, timer: true },
      NOW
    ).status
  ).toBe(200);
});
