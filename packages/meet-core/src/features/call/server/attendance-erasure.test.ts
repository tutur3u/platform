import { beforeEach, expect, it, vi } from 'vitest';
import { commitFencedUpsert } from './attendance-scope';
import {
  ATTENDANCE_ERASURE_FANOUT,
  commitAttendanceErasure,
  eraseMeetAttendanceForMeeting,
  eraseMeetAttendanceForWorkspace,
  eraseMeetAttendanceSubject,
  withWorkspaceAttendanceErasure,
  type AttendanceErasureDeps,
  type AttendanceErasurePlan,
} from './attendance-erasure';
import {
  attendanceErasureKey,
  planMeetingAttendanceRooms,
  planSubjectAttendanceRooms,
  planWorkspaceAttendanceRooms,
  subjectEraseClaims,
} from './attendance-erasure-plan';

vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));
vi.mock('@tuturuuu/realtime/meet/service-credential', () => ({
  MEET_SERVICE_TTL_SECONDS: 60,
  signMeetServiceCredential: () => 'token',
}));
vi.mock('../lib/call-session', () => ({
  getMeetRealtimeTokenSecret: () => 'secret',
  getMeetRealtimeUrl: () => 'http://meet.internal',
}));

function harness(patch: Partial<AttendanceErasureDeps> = {}) {
  const calls: string[] = [];
  const pending = new Map<string, AttendanceErasurePlan>();
  let generation = 0;
  const keyOf = (sql: AttendanceErasurePlan['sql']) => {
    const key = attendanceErasureKey(sql);
    return `${key.kind}:${key.subjectKey}`;
  };
  const deps: AttendanceErasureDeps = {
    listMeetings: async () => {
      calls.push('meetings');
      return ['meeting-1'];
    },
    listSessionWorkspaces: async () => {
      calls.push('sessions');
      return ['former'];
    },
    listSessionsByWorkspace: async () => {
      calls.push('workspace-sessions');
      return [{ wsId: 'former', meetingId: 'meeting-1' }];
    },
    listSessionsBySubject: async () => {
      calls.push('subject-sessions');
      return [];
    },
    directoryRoomIds: async () => {
      calls.push('directory');
      return ['unsynced:meeting-2'];
    },
    bumpFence: async () => {
      calls.push('fence');
      generation += 1;
      return generation;
    },
    postRoom: async () => {
      calls.push('room');
    },
    queueRooms: async () => {
      calls.push('queue');
    },
    forgetRooms: async () => {
      calls.push('forget');
    },
    deleteSql: async () => {
      calls.push('sql');
    },
    readPending: async (sql) => {
      calls.push('read-pending');
      const plan = pending.get(keyOf(sql));
      return plan ? structuredClone(plan) : null;
    },
    savePending: async (plan) => {
      calls.push('save-pending');
      pending.set(keyOf(plan.sql), structuredClone(plan));
    },
    finishPending: async (sql) => {
      calls.push('finish-pending');
      pending.delete(keyOf(sql));
    },
    listConfirmedPending: async (limit) => {
      calls.push('list-confirmed');
      return [...pending.values()]
        .filter((plan) => plan.phase === 'confirmed')
        .slice(0, limit)
        .map((plan) => structuredClone(plan));
    },
    ...patch,
  };
  return { calls, deps, pending, generation: () => generation };
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

it('still erases leftover copies while the switch is off', async () => {
  const { calls, deps } = harness({
    listMeetings: async () => [],
    listSessionsByWorkspace: async () => [],
    directoryRoomIds: async () => [],
  });
  await eraseMeetAttendanceForWorkspace('ws', deps);
  expect(calls).toContain('sql');
  expect(calls).not.toContain('fence');
});

it('covers former-workspace rooms and rooms that were never stored', () => {
  expect(
    planMeetingAttendanceRooms({
      wsId: 'current',
      meetingId: 'meeting-1',
      sessionWsIds: ['former'],
      directoryRoomIds: ['former:meeting-1', 'other:meeting-2'],
    }).map((room) => room.roomId)
  ).toEqual(['current:meeting-1', 'former:meeting-1']);
  expect(
    planWorkspaceAttendanceRooms({
      wsId: 'former',
      meetingIds: [],
      sessionRooms: [{ wsId: 'former', meetingId: 'meeting-1' }],
      directoryRoomIds: ['former:meeting-1', 'current:meeting-1'],
    }).map((room) => room.roomId)
  ).toEqual(['former:meeting-1']);
  expect(
    planSubjectAttendanceRooms({
      sessionRooms: [],
      directoryRoomIds: ['unsynced:meeting-2'],
    }).map((room) => room.roomId)
  ).toEqual(['unsynced:meeting-2']);
  expect(subjectEraseClaims({ op: 'subject', userId: 'user-1' })).toEqual([
    { userId: 'user-1' },
    { guestId: 'user-1' },
  ]);
});

it('stops before deleting rows when the room copy times out', async () => {
  const { calls, deps, pending } = harness({
    listMeetings: async () => [],
    listSessionsByWorkspace: async () => [
      { wsId: 'former', meetingId: 'meeting-1' },
    ],
    directoryRoomIds: async () => [],
    postRoom: async () => {
      calls.push('room');
      throw new Error('timeout');
    },
  });
  await expect(eraseMeetAttendanceForWorkspace('former', deps)).rejects.toThrow(
    'timeout'
  );
  expect(calls).toContain('fence');
  expect(calls).toContain('room');
  expect(calls).not.toContain('sql');
  const stored = [...pending.values()][0];
  expect(stored?.phase).toBe('confirmed');
  expect(stored?.rooms[0]?.generation).toBe(1);
  expect(stored?.attempts).toBe(1);
});

it('reuses one generation for both subject posts and for a retry', async () => {
  const posted: Array<Record<string, unknown>> = [];
  let fail = true;
  const { calls, deps, pending } = harness({
    listSessionsBySubject: async () => [],
    directoryRoomIds: async () => ['unsynced:meeting-2'],
    postRoom: async (_roomId, extra) => {
      calls.push('room');
      if (fail) throw new Error('timeout');
      posted.push(extra);
    },
  });
  await expect(
    eraseMeetAttendanceSubject({ userId: 'user-1' }, deps)
  ).rejects.toThrow('timeout');
  const stored = [...pending.values()][0];
  expect(stored?.rooms[0]?.generation).toBe(1);
  const fences = calls.filter((call) => call === 'fence').length;
  fail = false;
  await commitAttendanceErasure(structuredClone(stored), deps);
  expect(calls.filter((call) => call === 'fence').length).toBe(fences);
  expect(posted).toEqual([
    { erase: 'subject', userId: 'user-1', generation: 1 },
    { erase: 'subject', guestId: 'user-1', generation: 1 },
  ]);
  expect(calls).toContain('sql');
});

it('assigns the next generation when the same meeting is erased again', async () => {
  const generations: number[] = [];
  const { deps } = harness({
    listSessionWorkspaces: async () => [],
    directoryRoomIds: async () => [],
    bumpFence: async () => {
      const next = generations.length + 1;
      generations.push(next);
      return next;
    },
  });
  await eraseMeetAttendanceForMeeting('ws', 'meeting-1', deps);
  await eraseMeetAttendanceForMeeting('ws', 'meeting-1', deps);
  expect(generations).toEqual([1, 2]);
});

it('keeps concurrent erasures on one counter and bounds the room fan-out', async () => {
  const generations: number[] = [];
  let next = 0;
  let active = 0;
  let maxActive = 0;
  const shared = harness({
    listSessionWorkspaces: async () => [],
    directoryRoomIds: async () => [],
    bumpFence: async () => {
      next += 1;
      generations.push(next);
      return next;
    },
  });
  await Promise.all([
    eraseMeetAttendanceForMeeting('ws-a', 'meeting-1', shared.deps),
    eraseMeetAttendanceForMeeting('ws-b', 'meeting-2', shared.deps),
  ]);
  expect(generations).toEqual([1, 2]);

  const fanout = harness({
    listMeetings: async () => ['1', '2', '3', '4', '5', '6'],
    listSessionsByWorkspace: async () => [],
    directoryRoomIds: async () => [],
    postRoom: async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active -= 1;
    },
  });
  await eraseMeetAttendanceForWorkspace('ws', fanout.deps);
  expect(maxActive).toBe(ATTENDANCE_ERASURE_FANOUT);
});

it('fences an in-flight sync with the generation stored for the room', async () => {
  let generation = 0;
  const { deps } = harness({
    listSessionWorkspaces: async () => [],
    directoryRoomIds: async () => [],
    bumpFence: async () => {
      generation += 1;
      return generation;
    },
    postRoom: async (_roomId, extra) => {
      expect(extra.generation).toBe(1);
      await expect(
        commitFencedUpsert({
          epoch: 0,
          readGeneration: async () => extra.generation ?? 0,
          write: async () => {
            throw new Error('wrote');
          },
          compensate: async () => undefined,
        })
      ).rejects.toThrow('fenced');
    },
  });
  await eraseMeetAttendanceForMeeting('ws', 'meeting-1', deps);
  let wrote = false;
  await commitFencedUpsert({
    epoch: generation,
    readGeneration: async () => generation,
    write: async () => {
      wrote = true;
    },
    compensate: async () => {
      wrote = false;
    },
  });
  expect(wrote).toBe(true);
});

it('does not delete rows when the directory cannot be listed', async () => {
  const { calls, deps } = harness({
    directoryRoomIds: async () => {
      calls.push('directory');
      throw new Error('directory');
    },
  });
  await expect(
    eraseMeetAttendanceForMeeting('ws', 'meeting-1', deps)
  ).rejects.toThrow('directory');
  expect(calls).not.toContain('sql');
  expect(calls).not.toContain('fence');
});

it('resumes a confirmed erasure and does not bump its generation again', async () => {
  const posted: Array<Record<string, unknown>> = [];
  const { calls, deps, pending } = harness({
    listSessionsBySubject: async () => [],
    directoryRoomIds: async () => [],
    postRoom: async (_roomId, extra) => {
      posted.push(extra);
    },
  });
  pending.set('subject:user:other', {
    rooms: [
      {
        roomId: 'ws:meeting',
        wsId: 'ws',
        meetingId: 'meeting',
        generation: 4,
      },
    ],
    sql: { op: 'subject', userId: 'other' },
    phase: 'confirmed',
    attempts: 1,
  });
  await eraseMeetAttendanceSubject({ userId: 'user-1' }, deps);
  expect(posted).toEqual([
    { erase: 'subject', userId: 'other', generation: 4 },
    { erase: 'subject', guestId: 'other', generation: 4 },
  ]);
  expect(calls).not.toContain('fence');
  expect(pending.has('subject:user:other')).toBe(false);
});

it('does not erase a workspace when the delete is denied', async () => {
  const { calls, deps, pending } = harness({
    listMeetings: async () => ['meeting-1'],
    listSessionsByWorkspace: async () => [],
    directoryRoomIds: async () => [],
  });
  await expect(
    withWorkspaceAttendanceErasure(
      'ws',
      async () => ({ error: new Error('denied') }),
      deps
    )
  ).rejects.toThrow('denied');
  const failure = { code: 'failure' };
  await expect(
    withWorkspaceAttendanceErasure('ws', async () => ({ error: failure }), deps)
  ).rejects.toBe(failure);
  expect(calls).not.toContain('fence');
  expect(calls).not.toContain('sql');
  expect(pending.size).toBe(0);
  await withWorkspaceAttendanceErasure(
    'ws',
    async () => ({ error: null }),
    deps
  );
  expect(calls).toContain('sql');
});
