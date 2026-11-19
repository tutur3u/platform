import { beforeEach, expect, it, vi } from 'vitest';
import type { AttendanceInterval } from '@tuturuuu/realtime/meet';
import { MeetCallAccessError } from '../lib/call-access';
import { syncMeetAttendance, type AttendanceStore } from './attendance';

vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));
vi.mock('../lib/call-access', () => {
  class MeetCallAccessError extends Error {
    constructor(
      public status: number,
      message: string
    ) {
      super(message);
    }
  }
  return { MeetCallAccessError };
});
vi.mock('../lib/call-session', () => ({
  getMeetCallSession: vi.fn(),
}));

const NOW = '2026-07-31T12:30:00.000Z';
const interval: AttendanceInterval = {
  sourceKey: 'device:2026-07-31T12:00:00.000Z',
  deviceUserId: '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691',
  kind: 'member',
  userId: '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691',
  displayName: 'Ada',
  joinedAt: '2026-07-31T12:00:00.000Z',
};

function store(initial: AttendanceInterval[] = []): AttendanceStore & {
  upserts: AttendanceInterval[][];
} {
  let rows = initial;
  const upserts: AttendanceInterval[][] = [];
  return {
    upserts,
    async upsert(_meetingId, _wsId, incoming) {
      upserts.push(incoming);
      const byKey = new Map(rows.map((row) => [row.sourceKey, row]));
      for (const row of incoming) byKey.set(row.sourceKey, row);
      rows = [...byKey.values()];
    },
    async list() {
      return rows;
    },
  };
}

const input = {
  meetingId: '5e5217de-9bb3-4e20-8d99-526ad3e7e34f',
  wsId: '0f1a64f7-780f-4d30-9d72-5530f204e95c',
  userId: '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691',
  isHost: true,
  displayName: 'Ada',
  canReadWorkspace: true,
  coHost: false,
  now: NOW,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('MEET_CLASS_ATTENDANCE_ENABLED', 'true');
});

it('does not read or write attendance while the server switch is off', async () => {
  vi.stubEnv('MEET_CLASS_ATTENDANCE_ENABLED', 'false');
  const saved = store();
  const readLedger = vi.fn(async () => [interval]);
  await expect(
    syncMeetAttendance(input, { readLedger, store: saved })
  ).rejects.toMatchObject({ status: 404 });
  expect(readLedger).not.toHaveBeenCalled();
  expect(saved.upserts).toEqual([]);
});

it('upserts the live ledger and returns stored minutes', async () => {
  const saved = store();
  const rows = await syncMeetAttendance(input, {
    readLedger: async () => [interval],
    store: saved,
  });
  expect(saved.upserts).toEqual([[interval]]);
  expect(rows).toEqual([
    expect.objectContaining({ name: 'Ada', totalMinutes: 30, kind: 'member' }),
  ]);
});

it('keeps stored rows when the room worker is unreachable', async () => {
  const saved = store([{ ...interval, leftAt: '2026-07-31T12:10:00.000Z' }]);
  const rows = await syncMeetAttendance(input, {
    readLedger: async () => null,
    store: saved,
  });
  expect(saved.upserts).toEqual([]);
  expect(rows[0]?.totalMinutes).toBe(10);
});

it('fails closed when the attendance table is not migrated', async () => {
  const saved = store();
  saved.upsert = async () => {
    throw { code: '42P01', message: 'missing' };
  };
  await expect(
    syncMeetAttendance(input, {
      readLedger: async () => [interval],
      store: saved,
    })
  ).rejects.toBeInstanceOf(MeetCallAccessError);
});
