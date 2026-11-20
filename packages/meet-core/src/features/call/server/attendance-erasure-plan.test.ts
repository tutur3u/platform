import { expect, it } from 'vitest';
import {
  acknowledgeAttendanceRoom,
  attendanceErasureSettled,
  mergeAttendanceIntent,
  type AttendanceErasurePlan,
} from './attendance-erasure-plan';

const plan: AttendanceErasurePlan = {
  rooms: [
    {
      roomId: 'ws:meeting',
      wsId: 'ws',
      meetingId: 'meeting',
      generation: 4,
    },
  ],
  sql: { op: 'meeting', meetingId: 'meeting' },
  phase: 'confirmed',
  sqlDone: true,
};

it('ignores an acknowledgement from an older generation', () => {
  const acked = acknowledgeAttendanceRoom(plan, 'ws:meeting', 3, 'meeting');
  expect(acked.rooms[0]?.posted).toBeUndefined();
  expect(attendanceErasureSettled(acked)).toBe(false);
  const current = acknowledgeAttendanceRoom(plan, 'ws:meeting', 4, 'meeting');
  expect(current.rooms[0]?.posted).toEqual(['meeting']);
  expect(attendanceErasureSettled(current)).toBe(true);
});

it('does not replace a confirmed intent with a planned copy', () => {
  const kept = mergeAttendanceIntent(plan, {
    ...plan,
    phase: 'planned',
    sqlDone: false,
    rooms: [],
  });
  expect(kept).toBeNull();
  const merged = mergeAttendanceIntent(plan, {
    ...plan,
    rooms: [
      {
        roomId: 'ws:other',
        wsId: 'ws',
        meetingId: 'other',
        generation: 1,
      },
    ],
  });
  expect(merged?.rooms.map((room) => room.roomId)).toEqual([
    'ws:meeting',
    'ws:other',
  ]);
  expect(merged?.sqlDone).toBe(true);
});
