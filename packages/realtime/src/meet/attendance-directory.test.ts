import { expect, it } from 'vitest';
import type { AttendanceInterval } from './attendance-ledger';
import {
  applyAttendanceDirectory,
  ATTENDANCE_DIRECTORY_OVERFLOW_CAP,
  ATTENDANCE_DIRECTORY_PAGE,
  ATTENDANCE_DIRECTORY_ROOM_CAP,
  ATTENDANCE_INDEX_RETRY_MS,
  emptyAttendanceDirectory,
  forgetAttendanceRooms,
  noteAttendanceIndexPublish,
  pageAttendanceDirectory,
  planAttendanceEraseDrain,
  recordAttendanceIndexResult,
  rememberAttendanceRoom,
} from './attendance-directory';

const USER = '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691';
const GUEST = '4b320da6-6c8a-43fe-b1bf-09fbe77303f9';

function guestInterval(guestId = GUEST): AttendanceInterval {
  return {
    sourceKey: `${guestId}:2026-07-31T12:00:00.000Z`,
    deviceUserId: guestId,
    kind: 'guest',
    guestId,
    displayName: 'Lan',
    joinedAt: '2026-07-31T12:00:00.000Z',
  };
}

it('indexes a signed-in guest by guest id and pages every matching room', () => {
  let directory = emptyAttendanceDirectory();
  directory = rememberAttendanceRoom(
    directory,
    'ws-old:meeting-1',
    'meeting-1',
    [guestInterval(USER)]
  );
  for (let index = 0; index < ATTENDANCE_DIRECTORY_PAGE; index += 1) {
    directory = rememberAttendanceRoom(
      directory,
      `ws-a:meeting-${index + 2}`,
      `meeting-${index + 2}`,
      [guestInterval(USER)]
    );
  }
  const first = pageAttendanceDirectory(directory, { userId: USER }, 0);
  expect(first.roomIds).toHaveLength(ATTENDANCE_DIRECTORY_PAGE);
  expect(first.cursor).toBe(ATTENDANCE_DIRECTORY_PAGE);
  const second = pageAttendanceDirectory(
    directory,
    { userId: USER },
    first.cursor ?? 0
  );
  expect(second.roomIds).toEqual(['ws-old:meeting-1']);
  expect(second.cursor).toBeNull();
  expect(
    pageAttendanceDirectory(directory, { wsId: 'ws-old' }).roomIds
  ).toEqual(['ws-old:meeting-1']);
});

it('forgets a room so a recreated meeting id does not keep the old subjects', () => {
  const remembered = rememberAttendanceRoom(
    emptyAttendanceDirectory(),
    'ws-a:meeting',
    'meeting',
    [guestInterval()]
  );
  const forgotten = forgetAttendanceRooms(remembered, ['ws-a:meeting']);
  expect(
    pageAttendanceDirectory(forgotten, { guestId: GUEST }).roomIds
  ).toEqual([]);
});

it('applies remember and forget on the directory copy', () => {
  const remembered = applyAttendanceDirectory(emptyAttendanceDirectory(), {
    op: 'remember',
    roomId: 'ws-old:meeting',
    meetingId: 'meeting',
    users: [],
    guests: [USER],
  });
  expect(remembered.result).toEqual({ ok: true });
  const listed = applyAttendanceDirectory(remembered.directory, {
    op: 'list',
    userId: USER,
  });
  expect(listed.result).toMatchObject({ roomIds: ['ws-old:meeting'] });
  const forgotten = applyAttendanceDirectory(remembered.directory, {
    op: 'forget',
    roomIds: ['ws-old:meeting'],
  });
  expect(
    applyAttendanceDirectory(forgotten.directory, { op: 'list', userId: USER })
      .result
  ).toMatchObject({ roomIds: [] });
});

it('keeps the same directory when subjects do not change', () => {
  const directory = rememberAttendanceRoom(
    emptyAttendanceDirectory(),
    'ws-a:meeting',
    'meeting',
    [guestInterval()]
  );
  expect(
    rememberAttendanceRoom(directory, 'ws-a:meeting', 'meeting', [
      guestInterval(),
    ])
  ).toBe(directory);
  expect(forgetAttendanceRooms(directory, ['missing'])).toBe(directory);
});

it('bounds the directory and still lists overflow rooms', () => {
  let directory = emptyAttendanceDirectory();
  for (let index = 0; index < ATTENDANCE_DIRECTORY_ROOM_CAP; index += 1) {
    directory = rememberAttendanceRoom(
      directory,
      `ws-a:meeting-${index}`,
      `meeting-${index}`,
      [guestInterval()]
    );
  }
  const overflowed = rememberAttendanceRoom(directory, 'ws-a:extra', 'extra', [
    guestInterval(),
  ]);
  expect(overflowed.rooms['ws-a:extra']).toBeUndefined();
  expect(
    pageAttendanceDirectory(overflowed, { guestId: GUEST }).roomIds
  ).toContain('ws-a:extra');
  let full = overflowed;
  for (
    let index = 0;
    index < ATTENDANCE_DIRECTORY_OVERFLOW_CAP - 1;
    index += 1
  ) {
    full = rememberAttendanceRoom(
      full,
      `ws-b:overflow-${index}`,
      `overflow-${index}`,
      [guestInterval()]
    );
  }
  const blocked = applyAttendanceDirectory(full, {
    op: 'remember',
    roomId: 'ws-b:too-many',
    meetingId: 'too-many',
    users: [],
    guests: [GUEST],
  });
  expect(blocked.result).toEqual({ ok: false, error: 'directory_full' });
  expect(blocked.directory).toBe(full);
});

it('keeps erase attempts for one generation and stops when the budget is spent', () => {
  const queued = applyAttendanceDirectory(emptyAttendanceDirectory(), {
    op: 'queue-erase',
    rooms: [
      {
        roomId: 'ws-a:meeting',
        generation: 2,
        claims: [{ erase: 'meeting' }],
      },
    ],
  });
  const same = applyAttendanceDirectory(queued.directory, {
    op: 'queue-erase',
    rooms: [
      {
        roomId: 'ws-a:meeting',
        generation: 2,
        claims: [{ erase: 'meeting' }],
      },
    ],
  });
  expect(same.directory).toBe(queued.directory);
  expect(queued.directory.pending?.['ws-a:meeting']?.attempts).toBe(0);
  const older = applyAttendanceDirectory(queued.directory, {
    op: 'queue-erase',
    rooms: [{ roomId: 'ws-a:meeting', generation: 1 }],
  });
  expect(older.directory).toBe(queued.directory);
  let drained = queued.directory;
  let rescheduleAt: number | null = 0;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const next = planAttendanceEraseDrain(drained, attempt * 1_000);
    expect(next.posts).toHaveLength(1);
    expect(next.directory.pending?.['ws-a:meeting']?.attempts).toBe(attempt);
    drained = next.directory;
    rescheduleAt = next.rescheduleAt;
  }
  expect(rescheduleAt).toBeNull();
  const stopped = planAttendanceEraseDrain(drained, 9_000);
  expect(stopped.posts).toEqual([]);
  expect(stopped.rescheduleAt).toBeNull();
  expect(stopped.directory).toBe(drained);
  const idle = planAttendanceEraseDrain(emptyAttendanceDirectory(), 1_000);
  expect(idle.posts).toEqual([]);
  expect(idle.rescheduleAt).toBeNull();
  expect(idle.directory).toEqual(emptyAttendanceDirectory());
});

it('does not republish an unchanged or stopped attendance index', () => {
  const signature = 'user';
  const started = noteAttendanceIndexPublish(undefined, signature, 1_000);
  expect(started.publish).toBe(true);
  expect(started.state?.nextAt).toBe(1_000 + ATTENDANCE_INDEX_RETRY_MS);
  const waiting = noteAttendanceIndexPublish(started.state, signature, 2_000);
  expect(waiting.publish).toBe(false);
  expect(waiting.state).toBe(started.state);
  const success = recordAttendanceIndexResult(started.state!, true, 2_000);
  expect(success.state.nextAt).toBeUndefined();
  expect(
    noteAttendanceIndexPublish(success.state, signature, 3_000).publish
  ).toBe(false);
  const failed = [1, 2, 3].reduce(
    (state) => recordAttendanceIndexResult(state, false, 1_000).state,
    started.state!
  );
  expect(failed.stopped).toBe(true);
  const stopped = noteAttendanceIndexPublish(failed, signature, 99_000);
  expect(stopped.publish).toBe(false);
  expect(stopped.state).toBe(failed);
});
