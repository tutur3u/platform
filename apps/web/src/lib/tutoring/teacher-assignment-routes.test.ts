// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const wsId = '5d23287f-9094-4714-b8e0-dcce877464a0';
const id = 'f0747f37-bf6d-4263-a5df-a11c57bdc762';
const teacher = '18a911d9-358c-4fe7-936f-ef6f17be1eb8';
const group = '35d890d8-a79a-4648-b448-a206ac534d5c';
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  admin: vi.fn(),
  eligibility: vi.fn(),
  scope: vi.fn(),
}));
vi.mock('next/server', () => ({
  NextResponse: { json: Response.json },
  connection: async () => {},
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.admin,
}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: async () => ({ user: { id: 'actor' } }),
}));
vi.mock('@/lib/tutoring/route-access', () => ({
  resolveTutoringRouteAccess: mocks.access,
  createTutoringRequestClient: async () => ({}),
}));
vi.mock('@/lib/tutoring/teachers', () => ({
  listWorkspaceTeacherIds: mocks.eligibility,
}));
vi.mock(
  '@/legacy-api-routes/v1/workspaces/[wsId]/tutoring/sessions/session-create-helpers',
  async (original) => ({
    ...(await original<object>()),
    validateTutoringSessionScope: mocks.scope,
    listPotentialSchedulingConflicts: async () => ({ data: [], error: null }),
  })
);
const query = {
  select: vi.fn(() => query),
  eq: vi.fn(() => query),
  in: vi.fn(() => query),
  neq: vi.fn(() => query),
  insert: vi.fn(() => query),
  update: vi.fn(() => query),
  maybeSingle: vi.fn(async () => ({
    data: {
      id,
      group_id: group,
      student_user_id: id,
      session_date: '2026-10-07',
      start_time: '17:15',
      duration_minutes: 45,
      teacher_user_id: teacher,
    },
    error: null,
  })),
  // biome-ignore lint/suspicious/noThenProperty: Supabase query builders are intentionally awaitable.
  then: (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(resolve),
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({
    normalizedWsId: wsId,
    permissions: { withoutPermission: () => false },
    user: { id: 'actor' },
  });
  mocks.admin.mockResolvedValue({ schema: () => ({ from: () => query }) });
  mocks.eligibility.mockResolvedValue({
    teacherIds: new Set([teacher]),
    error: null,
  });
  mocks.scope.mockResolvedValue(null);
});
async function call(method: 'POST' | 'PUT') {
  const body =
    method === 'POST'
      ? {
          groupId: group,
          studentUserId: id,
          teacherUserId: teacher,
          sessionDate: '2026-10-07',
          startTime: '17:15',
          reasonType: 'CUSTOM',
        }
      : { teacherUserId: teacher };
  const request = new Request('http://localhost/tutoring', {
    method,
    body: JSON.stringify(body),
  });
  if (method === 'POST') {
    const { POST } = await import(
      '@/app/api/v1/workspaces/[wsId]/tutoring/sessions/route'
    );
    return POST(request, { params: Promise.resolve({ wsId }) });
  }
  const { PUT } = await import(
    '@/app/api/v1/workspaces/[wsId]/tutoring/sessions/[id]/route'
  );
  return PUT(request, { params: Promise.resolve({ wsId, id }) });
}
describe.each(['POST', 'PUT'] as const)(
  '%s tutoring teacher assignment',
  (method) => {
    it('accepts an eligible center teacher without a selected-class restriction', async () => {
      expect((await call(method)).status).toBe(200);
      expect(mocks.eligibility).toHaveBeenCalledWith({
        normalizedWsId: wsId,
        sbAdmin: expect.anything(),
        teacherUserIds: [teacher],
      });
    });
    it('rejects nonteacher or cross-workspace IDs before writing', async () => {
      mocks.eligibility.mockResolvedValue({
        teacherIds: new Set(),
        error: null,
      });
      expect((await call(method)).status).toBe(400);
      expect(query.insert).not.toHaveBeenCalled();
      expect(query.update).not.toHaveBeenCalled();
    });
    it('does not convert an eligibility outage into permission', async () => {
      mocks.eligibility.mockResolvedValue({
        teacherIds: new Set(),
        error: { message: 'offline' },
      });
      expect((await call(method)).status).toBe(500);
      expect(query.insert).not.toHaveBeenCalled();
      expect(query.update).not.toHaveBeenCalled();
    });
    it('enforces existing management permission before admin access', async () => {
      mocks.access.mockResolvedValue({
        normalizedWsId: wsId,
        permissions: { withoutPermission: () => true },
      });
      expect((await call(method)).status).toBe(403);
      expect(mocks.admin).not.toHaveBeenCalled();
    });
  }
);
it('retains student and class validation before teacher selection', async () => {
  mocks.scope.mockResolvedValue(
    Response.json({ message: 'Student is not in group' }, { status: 400 })
  );
  expect((await call('POST')).status).toBe(400);
  expect(mocks.eligibility).not.toHaveBeenCalled();
  expect(query.insert).not.toHaveBeenCalled();
});
