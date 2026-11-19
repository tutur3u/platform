import { expect, it } from 'vitest';
import type { AttendanceInterval } from './attendance-ledger';
import {
  applyAttendanceDirectory,
  ATTENDANCE_DIRECTORY_PAGE,
  emptyAttendanceDirectory,
  forgetAttendanceRooms,
  pageAttendanceDirectory,
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
