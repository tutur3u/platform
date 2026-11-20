import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const {
  flags,
  prepareMock,
  readPendingMock,
  enqueueMock,
  rpcMock,
  deleteMock,
  meetingMock,
} = vi.hoisted(() => ({
  flags: { attendance: true },
  prepareMock: vi.fn(),
  readPendingMock: vi.fn(),
  enqueueMock: vi.fn(),
  rpcMock: vi.fn(),
  deleteMock: vi.fn(),
  meetingMock: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: async () => ({
    ok: true,
    user: { id: '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691' },
    supabase: {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: () => meetingMock(),
            }),
          }),
        }),
        delete: () => ({
          eq: () => ({
            eq: () => ({
              select: () => deleteMock(),
            }),
          }),
        }),
      }),
    },
  }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: async (wsId: string) => wsId,
  verifyWorkspaceMembershipType: async () => ({ ok: true }),
}));
vi.mock('./_lib/recording-access', () => ({
  canManageLegacyRecording: async () => true,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    schema: () => ({ rpc: rpcMock }),
  }),
}));
vi.mock('@tuturuuu/meet-core/features/call/server/attendance-erasure', () => ({
  prepareMeetingAttendanceErasure: (...args: unknown[]) => prepareMock(...args),
  readPendingAttendanceErasure: (...args: unknown[]) =>
    readPendingMock(...args),
  enqueueAttendanceErasure: (...args: unknown[]) => enqueueMock(...args),
}));
vi.mock('@tuturuuu/realtime/meet', () => ({
  meetClassAttendanceEnabled: () => flags.attendance,
}));

import { DELETE } from './route';

const WS = '0f1a64f7-780f-4d30-9d72-5530f204e95c';
const MEETING = '5e5217de-9bb3-4e20-8d99-526ad3e7e34f';

beforeEach(() => {
  vi.clearAllMocks();
  flags.attendance = true;
  meetingMock.mockResolvedValue({
    data: {
      id: MEETING,
      creator_id: '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691',
    },
  });
  prepareMock.mockResolvedValue({
    rooms: [{ roomId: `${WS}:${MEETING}`, wsId: WS, meetingId: MEETING }],
    sql: { op: 'meeting', meetingId: MEETING },
    phase: 'planned',
  });
  readPendingMock.mockResolvedValue(null);
  enqueueMock.mockResolvedValue(undefined);
  rpcMock.mockResolvedValue({ data: 'deleted', error: null });
  deleteMock.mockResolvedValue({ data: [{ id: MEETING }], error: null });
});

function call() {
  return DELETE(
    new NextRequest(
      `http://localhost/api/v1/workspaces/${WS}/meetings/${MEETING}`,
      {
        method: 'DELETE',
      }
    ),
    { params: Promise.resolve({ wsId: WS, meetingId: MEETING }) }
  );
}

it('erases the room copy only after the meeting row is deleted', async () => {
  const order: string[] = [];
  prepareMock.mockImplementation(async () => {
    order.push('prepare');
    return {
      rooms: [],
      sql: { op: 'meeting', meetingId: MEETING },
      phase: 'planned',
    };
  });
  rpcMock.mockImplementation(async () => {
    order.push('delete');
    return { data: 'deleted', error: null };
  });
  enqueueMock.mockImplementation(async () => {
    order.push('enqueue');
  });
  const response = await call();
  expect(response.status).toBe(200);
  expect(order).toEqual(['prepare', 'delete', 'enqueue']);
  expect(deleteMock).not.toHaveBeenCalled();

  order.length = 0;
  rpcMock.mockImplementation(async () => {
    order.push('delete');
    return { data: 'not_deleted', error: null };
  });
  const denied = await call();
  expect(denied.status).toBe(403);
  expect(order).toEqual(['prepare', 'delete']);
  expect(readPendingMock).not.toHaveBeenCalled();
  expect(enqueueMock).toHaveBeenCalledTimes(1);
});

it('does not delete the meeting when planning erasure fails', async () => {
  prepareMock.mockRejectedValue(new Error('timeout'));
  const response = await call();
  expect(response.status).toBe(500);
  expect(deleteMock).not.toHaveBeenCalled();
  expect(rpcMock).not.toHaveBeenCalled();
});

it('deletes the meeting while attendance is off without calling erasure', async () => {
  flags.attendance = false;
  prepareMock.mockRejectedValue(new Error('missing migration'));
  const response = await call();
  expect(response.status).toBe(200);
  expect(deleteMock).toHaveBeenCalledOnce();
  expect(prepareMock).not.toHaveBeenCalled();
  expect(readPendingMock).not.toHaveBeenCalled();
  expect(enqueueMock).not.toHaveBeenCalled();
  expect(rpcMock).not.toHaveBeenCalled();
});

it('does not resume an erasure for a meeting outside this workspace', async () => {
  meetingMock.mockResolvedValue({
    data: null,
    error: { code: 'PGRST116', message: 'missing' },
  });
  readPendingMock.mockResolvedValue({
    rooms: [],
    sql: { op: 'meeting', meetingId: MEETING },
    phase: 'confirmed',
  });
  const response = await call();
  expect(response.status).toBe(404);
  expect(readPendingMock).not.toHaveBeenCalled();
  expect(enqueueMock).not.toHaveBeenCalled();
  expect(deleteMock).not.toHaveBeenCalled();
  expect(prepareMock).not.toHaveBeenCalled();
  expect(rpcMock).not.toHaveBeenCalled();
});

it('treats a meeting lookup error as a failure instead of a missing meeting', async () => {
  meetingMock.mockResolvedValue({
    data: null,
    error: {
      code: '57014',
      message: 'canceling statement due to statement timeout',
    },
  });
  readPendingMock.mockResolvedValue({
    rooms: [],
    sql: { op: 'meeting', meetingId: MEETING },
    phase: 'confirmed',
  });
  const response = await call();
  expect(response.status).toBe(500);
  expect(readPendingMock).not.toHaveBeenCalled();
  expect(enqueueMock).not.toHaveBeenCalled();
  expect(deleteMock).not.toHaveBeenCalled();
  expect(rpcMock).not.toHaveBeenCalled();
});
