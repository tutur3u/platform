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
  fetch: vi.fn(),
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
vi.mock('@tuturuuu/meet-core/features/call/lib/call-session', () => ({
  getMeetRealtimeTokenSecret: () => 'secret',
  getMeetRealtimeUrl: () => 'https://realtime.test/realtime',
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ kind: 'admin' }),
}));
vi.mock('@tuturuuu/meet-core/features/meeting-ai/server/notes-admin', () => ({
  isMeetingNotesAdmin: fixture.admin,
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

import { POST } from './route';

const meetingId = '5e5217de-9bb3-4e20-8d99-526ad3e7e34f';

function request(body: unknown) {
  return new Request(
    `https://meet.test/api/meet-call/${meetingId}/class-timer`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    }
  );
}

beforeEach(() => {
  vi.stubEnv('MEET_CLASS_TIMER_ENABLED', 'true');
  fixture.access.isHost = false;
  fixture.access.canReadWorkspace = true;
  fixture.admin.mockReset();
  fixture.fetch.mockReset();
  fixture.fetch.mockResolvedValue(
    new Response(JSON.stringify({ ok: true }), { status: 200 })
  );
  vi.stubGlobal('fetch', fixture.fetch);
});

it('returns 404 without contacting the room while the timer is off', async () => {
  vi.stubEnv('MEET_CLASS_TIMER_ENABLED', 'false');
  fixture.access.isHost = true;
  const response = await POST(
    request({ action: 'start', durationMs: 60_000 }),
    {
      params: Promise.resolve({ meetingId }),
    }
  );
  expect(response.status).toBe(404);
  expect(fixture.fetch).not.toHaveBeenCalled();
});

it('rejects a co-host pause before signing a room command', async () => {
  fixture.admin.mockResolvedValue(true);
  const response = await POST(request({ action: 'pause' }), {
    params: Promise.resolve({ meetingId }),
  });
  expect(response.status).toBe(403);
  expect(fixture.fetch).not.toHaveBeenCalled();
});

it('forwards a host command with a server credential', async () => {
  fixture.access.isHost = true;
  const response = await POST(
    request({ action: 'start', durationMs: 60_000 }),
    {
      params: Promise.resolve({ meetingId }),
    }
  );
  expect(response.status).toBe(200);
  const call = fixture.fetch.mock.calls[0];
  expect(String(call?.[0])).toContain('/class-service');
  const authorization =
    new Headers(call?.[1]?.headers).get('Authorization') ?? '';
  expect(authorization.startsWith('Bearer ')).toBe(true);
  expect(authorization).not.toContain('class:cohost');
});
