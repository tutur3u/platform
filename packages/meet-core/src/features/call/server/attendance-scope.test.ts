import { expect, it } from 'vitest';
import type { AttendanceInterval } from '@tuturuuu/realtime/meet';
import {
  planAttendanceUpsert,
  readAttendancePages,
  type AttendanceStoredRow,
} from './attendance-scope';

const interval: AttendanceInterval = {
  sourceKey: 'device:2026-07-31T12:00:00.000Z',
  deviceUserId: '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691',
  kind: 'member',
  userId: '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691',
  displayName: 'Ada',
  joinedAt: '2026-07-31T12:00:00.000Z',
};

function stored(
  wsId: string,
  patch: Partial<AttendanceStoredRow> = {}
): AttendanceStoredRow {
  return {
    sourceKey: interval.sourceKey,
    wsId,
    kind: 'member',
    userId: interval.userId ?? null,
    guestId: null,
    displayName: interval.displayName,
    joinedAt: interval.joinedAt,
    leftAt: null,
    ...patch,
  };
}

it('keeps a collected row in its original workspace after the meeting moves', () => {
  const plan = planAttendanceUpsert(
    [stored('ws-a')],
    [{ ...interval, displayName: 'Moved' }],
    'ws-b'
  );
  expect(plan.insert).toEqual([]);
  expect(plan.update).toEqual([]);
});

it('skips an unchanged row and updates a changed row without moving its workspace', () => {
  const same = planAttendanceUpsert([stored('ws-a')], [interval], 'ws-a');
  expect(same.insert).toEqual([]);
  expect(same.update).toEqual([]);
  const changed = planAttendanceUpsert(
    [stored('ws-a')],
    [{ ...interval, leftAt: '2026-07-31T12:30:00.000Z' }],
    'ws-a'
  );
  expect(changed.update).toEqual([
    { ...interval, leftAt: '2026-07-31T12:30:00.000Z' },
  ]);
});

it('pages past the 1000-row read limit in stable ranges', async () => {
  const ranges: Array<[number, number]> = [];
  const rows = await readAttendancePages(async (from, to) => {
    ranges.push([from, to]);
    return from === 0
      ? Array.from({ length: 1000 }, (_, index) => index)
      : [1000];
  });
  expect(ranges).toEqual([
    [0, 999],
    [1000, 1999],
  ]);
  expect(rows).toHaveLength(1001);
  expect(rows.at(-1)).toBe(1000);
});
