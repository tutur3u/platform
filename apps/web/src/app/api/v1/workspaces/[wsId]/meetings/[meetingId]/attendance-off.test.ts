import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const { imports, deleteMock, meetingMock } = vi.hoisted(() => ({
  imports: { count: 0 },
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
  createAdminClient: () => {
    throw new Error('admin client');
  },
}));
vi.mock('@tuturuuu/realtime/meet', () => ({
  meetClassAttendanceEnabled: () => false,
}));
vi.mock('@tuturuuu/meet-core/features/call/server/attendance-erasure', () => {
  imports.count += 1;
  throw new Error('missing migration');
});

import { DELETE } from './route';

const WS = '0f1a64f7-780f-4d30-9d72-5530f204e95c';
const MEETING = '5e5217de-9bb3-4e20-8d99-526ad3e7e34f';

beforeEach(() => {
  vi.clearAllMocks();
  meetingMock.mockResolvedValue({
    data: { id: MEETING, creator_id: '9b5c036d-d38d-4c12-b8e8-2e0b2b4a2691' },
    error: null,
  });
  deleteMock.mockResolvedValue({ data: [{ id: MEETING }], error: null });
});

function call() {
  return DELETE(
    new NextRequest(
      `http://localhost/api/v1/workspaces/${WS}/meetings/${MEETING}`,
      { method: 'DELETE' }
    ),
    { params: Promise.resolve({ wsId: WS, meetingId: MEETING }) }
  );
}

it('deletes a meeting while attendance storage is unavailable', async () => {
  const response = await call();
  expect(response.status).toBe(200);
  expect(deleteMock).toHaveBeenCalledOnce();
  expect(imports.count).toBe(0);
});

it('does not advance another workspace plan when the meeting row is absent', async () => {
  meetingMock.mockResolvedValue({
    data: null,
    error: { code: 'PGRST116', message: 'missing' },
  });
  const response = await call();
  expect(response.status).toBe(404);
  expect(deleteMock).not.toHaveBeenCalled();
  expect(imports.count).toBe(0);
});

it('does not treat a meeting lookup error as a missing meeting', async () => {
  meetingMock.mockResolvedValue({
    data: null,
    error: { code: '57014', message: 'statement timeout' },
  });
  const response = await call();
  expect(response.status).toBe(500);
  expect(deleteMock).not.toHaveBeenCalled();
  expect(imports.count).toBe(0);
});
