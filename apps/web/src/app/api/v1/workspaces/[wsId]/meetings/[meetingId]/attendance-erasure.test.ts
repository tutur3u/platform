import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const {
  flags,
  openMock,
  readPendingMock,
  releaseMock,
  commitMock,
  deleteMock,
  meetingMock,
} = vi.hoisted(() => ({
  flags: { attendance: true },
  openMock: vi.fn(),
  readPendingMock: vi.fn(),
  releaseMock: vi.fn(),
  commitMock: vi.fn(),
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
vi.mock('@tuturuuu/meet-core/features/call/server/attendance-erasure', () => ({
  openMeetingAttendanceErasure: (...args: unknown[]) => openMock(...args),
  readPendingAttendanceErasure: (...args: unknown[]) =>
    readPendingMock(...args),
  releaseAttendanceErasure: (...args: unknown[]) => releaseMock(...args),
  commitAttendanceErasure: (...args: unknown[]) => commitMock(...args),
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
  openMock.mockResolvedValue({
    plan: {
      rooms: [{ roomId: `${WS}:${MEETING}`, wsId: WS, meetingId: MEETING }],
      sql: { op: 'meeting', meetingId: MEETING },
      phase: 'planned',
    },
    preexisting: false,
  });
  readPendingMock.mockResolvedValue(null);
  releaseMock.mockResolvedValue(undefined);
  commitMock.mockResolvedValue(undefined);
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
  openMock.mockImplementation(async () => {
    order.push('open');
    return {
      plan: {
        rooms: [],
        sql: { op: 'meeting', meetingId: MEETING },
        phase: 'planned',
      },
      preexisting: false,
    };
  });
  deleteMock.mockImplementation(async () => {
    order.push('delete');
    return { data: [{ id: MEETING }], error: null };
  });
  commitMock.mockImplementation(async () => {
    order.push('commit');
  });
  const response = await call();
  expect(response.status).toBe(200);
  expect(order).toEqual(['open', 'delete', 'commit']);

  order.length = 0;
  deleteMock.mockImplementation(async () => {
    order.push('delete');
    return { data: [], error: null };
  });
  const denied = await call();
  expect(denied.status).toBe(403);
  expect(order).toEqual(['open', 'delete']);
  expect(releaseMock).toHaveBeenCalledTimes(1);
});

it('does not delete the meeting when planning erasure fails', async () => {
  openMock.mockRejectedValue(new Error('timeout'));
  const response = await call();
  expect(response.status).toBe(500);
  expect(deleteMock).not.toHaveBeenCalled();
});

it('still blocks the meeting delete when attendance erasure is off', async () => {
  flags.attendance = false;
  openMock.mockRejectedValue(new Error('timeout'));
  const response = await call();
  expect(response.status).toBe(500);
  expect(deleteMock).not.toHaveBeenCalled();
});

it('finishes a pending erasure when the meeting is already gone', async () => {
  meetingMock.mockResolvedValue({ data: null });
  readPendingMock.mockResolvedValue({
    rooms: [],
    sql: { op: 'meeting', meetingId: MEETING },
    phase: 'confirmed',
  });
  const response = await call();
  expect(response.status).toBe(200);
  expect(commitMock).toHaveBeenCalledOnce();
  expect(deleteMock).not.toHaveBeenCalled();

  commitMock.mockClear();
  readPendingMock.mockResolvedValue(null);
  const missing = await call();
  expect(missing.status).toBe(404);
  expect(commitMock).not.toHaveBeenCalled();
});
