import { beforeEach, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  access: {
    user: { id: '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691' },
    meeting: {
      id: '5e5217de-9bb3-4e20-8d99-526ad3e7e34f',
      ws_id: '0f1a64f7-780f-4d30-9d72-5530f204e95c',
    },
    isHost: false,
    canReadWorkspace: true,
    displayName: 'Ada',
  },
  admin: vi.fn(),
  sync: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ connection: async () => undefined }));
vi.mock('@tuturuuu/meet-core/features/call/lib/call-access', () => {
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
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ kind: 'admin' }),
}));
vi.mock('@tuturuuu/meet-core/features/meeting-ai/server/notes-admin', () => ({
  isMeetingNotesAdmin: fixture.admin,
}));
vi.mock('@tuturuuu/meet-core/features/call/server/attendance', () => ({
  syncMeetAttendance: fixture.sync,
}));
vi.mock('@tuturuuu/meet-core/features/call/server/room-service', () => ({
  roomRoute: async (
    _request: Request,
    meetingId: string,
    work: (access: typeof fixture.access) => Promise<unknown>
  ) => {
    try {
      const result = await work({
        ...fixture.access,
        meeting: { ...fixture.access.meeting, id: meetingId },
      });
      return result instanceof Response ? result : Response.json(result);
    } catch (error) {
      const problem = error as { status?: number; message?: string };
      return Response.json(
        { error: problem.message },
        { status: problem.status ?? 500 }
      );
    }
  },
}));

import { GET } from './route';

const meetingId = '5e5217de-9bb3-4e20-8d99-526ad3e7e34f';

function request(format?: string) {
  const suffix = format ? `?format=${format}` : '';
  return new Request(
    `https://meet.test/api/meet-call/${meetingId}/attendance${suffix}`
  );
}

beforeEach(() => {
  vi.stubEnv('MEET_CLASS_ATTENDANCE_ENABLED', 'true');
  vi.stubEnv(
    'MEET_ATTENDANCE_RETENTION_VERIFIED',
    'meet-attendance-retention:17 18 * * *:purge_expired_meet_attendance'
  );
  fixture.access.isHost = false;
  fixture.access.canReadWorkspace = true;
  fixture.admin.mockReset();
  fixture.sync.mockReset();
  fixture.sync.mockResolvedValue([
    {
      name: 'Ada',
      firstJoin: '2026-07-31T12:00:00.000Z',
      totalMinutes: 12,
      kind: 'member',
      userId: fixture.access.user.id,
    },
  ]);
});

it('returns 404 and does not read attendance while the server switch is off', async () => {
  vi.stubEnv('MEET_CLASS_ATTENDANCE_ENABLED', 'false');
  fixture.access.isHost = true;
  const response = await GET(request(), {
    params: Promise.resolve({ meetingId }),
  });
  expect(response.status).toBe(404);
  expect(fixture.sync).not.toHaveBeenCalled();
});

it('hides attendance from a workspace member who is not a host or admin', async () => {
  fixture.admin.mockResolvedValue(false);
  const response = await GET(request(), {
    params: Promise.resolve({ meetingId }),
  });
  expect(response.status).toBe(403);
  expect(fixture.sync).not.toHaveBeenCalled();
});

it('returns rows to the host and to a co-host admin', async () => {
  fixture.access.isHost = true;
  const host = await GET(request(), { params: Promise.resolve({ meetingId }) });
  expect(host.status).toBe(200);
  const payload = await host.json();
  expect(payload).toEqual({
    rows: [expect.objectContaining({ name: 'Ada', totalMinutes: 12 })],
  });
  expect(payload.rows[0]).not.toHaveProperty('userId');
  expect(payload.rows[0]).not.toHaveProperty('guestId');
  expect(fixture.admin).not.toHaveBeenCalled();

  fixture.access.isHost = false;
  fixture.admin.mockResolvedValue(true);
  const cohost = await GET(request(), {
    params: Promise.resolve({ meetingId }),
  });
  expect(cohost.status).toBe(200);
  expect(fixture.sync).toHaveBeenCalledTimes(2);
});

it('fails closed when the admin lookup fails and downloads CSV for an authorized host', async () => {
  fixture.admin.mockRejectedValue(new Error('down'));
  const failed = await GET(request(), {
    params: Promise.resolve({ meetingId }),
  });
  expect(failed.status).toBe(503);
  expect(fixture.sync).not.toHaveBeenCalled();

  fixture.access.isHost = true;
  const csv = await GET(request('csv'), {
    params: Promise.resolve({ meetingId }),
  });
  expect(csv.headers.get('Content-Type')).toContain('text/csv');
  const body = await csv.text();
  expect(body).toContain('name,first_join,total_minutes,kind');
  expect(body).not.toContain('user_id');
  expect(body).not.toContain('guest_id');
  expect(body).toContain('Ada');
});
