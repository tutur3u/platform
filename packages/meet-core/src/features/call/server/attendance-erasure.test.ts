import { beforeEach, expect, it, vi } from 'vitest';
import {
  commitAttendanceErasure,
  eraseMeetAttendanceForMeeting,
  eraseMeetAttendanceForWorkspace,
  eraseMeetAttendanceSubject,
  type AttendanceErasureDeps,
} from './attendance-erasure';
import {
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

function harness(patch: Partial<AttendanceErasureDeps> = {}): {
  calls: string[];
  deps: AttendanceErasureDeps;
} {
  const calls: string[] = [];
  const deps: AttendanceErasureDeps = {
    enabled: () => true,
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
    },
    postRoom: async () => {
      calls.push('room');
    },
    forgetRooms: async () => {
      calls.push('forget');
    },
    deleteSql: async () => {
      calls.push('sql');
    },
    ...patch,
  };
  return { calls, deps };
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

it('does no attendance io while the switch is off', async () => {
  const disabled = harness({ enabled: () => false });
  await eraseMeetAttendanceForWorkspace('ws', disabled.deps);
  await eraseMeetAttendanceForMeeting('ws', 'meeting-1', disabled.deps);
  await eraseMeetAttendanceSubject({ userId: 'user-1' }, disabled.deps);
  expect(disabled.calls).toEqual([]);
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
  const { calls, deps } = harness({
    postRoom: async () => {
      calls.push('room');
      throw new Error('timeout');
    },
  });
  await expect(eraseMeetAttendanceForWorkspace('former', deps)).rejects.toThrow(
    'timeout'
  );
  expect(calls).toEqual([
    'meetings',
    'workspace-sessions',
    'directory',
    'fence',
    'room',
  ]);
  expect(calls).not.toContain('sql');
});

it('fences, erases both subject keys, then deletes rows', async () => {
  const posted: Array<Record<string, unknown>> = [];
  const { calls, deps } = harness({
    postRoom: async (_roomId, extra) => {
      calls.push('room');
      posted.push(extra);
    },
  });
  await commitAttendanceErasure(
    {
      rooms: [
        { roomId: 'former:meeting-1', wsId: 'former', meetingId: 'meeting-1' },
      ],
      sql: { op: 'subject', userId: 'user-1' },
    },
    deps
  );
  expect(calls).toEqual(['fence', 'room', 'room', 'forget', 'sql']);
  expect(posted).toEqual([
    { erase: 'subject', userId: 'user-1' },
    { erase: 'subject', guestId: 'user-1' },
  ]);
});
