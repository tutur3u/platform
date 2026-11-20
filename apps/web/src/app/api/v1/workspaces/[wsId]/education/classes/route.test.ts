import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(),
  auth: vi.fn(),
  subject: vi.fn(),
  educationEnabled: vi.fn(),
  contact: vi.fn(),
  membership: vi.fn(),
  permissions: vi.fn(),
  list: vi.fn(),
  db: vi.fn(),
}));

vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: async () => {},
}));
vi.mock('@/lib/api-auth', () => ({ resolveSessionAuthContext: mocks.auth }));
vi.mock('@/lib/education/learner-progress-flag', () => ({
  learnerProgressRoutesEnabled: mocks.enabled,
}));
vi.mock('@/lib/education/lms-class-catalog', () => ({
  listLmsClasses: mocks.list,
}));
vi.mock('@tuturuuu/education-core/tulearn/service', () => ({
  resolveTulearnSubject: mocks.subject,
  resolveStudentForPlatformUser: mocks.contact,
  hasEducationEnabled: mocks.educationEnabled,
  tulearnAccessErrorResponse: () => null,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.db,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: async () => 'normalized-workspace',
  verifyWorkspaceMembershipType: mocks.membership,
  getPermissions: mocks.permissions,
}));

import { GET } from './route';

const learnerId = 'c7100000-0000-4000-8000-000000000001';
const classId = 'c7100000-0000-4000-8000-000000000002';

function request(query = '') {
  return new NextRequest(
    `https://tuturuuu.com/api/v1/workspaces/alias/education/classes${query}`
  );
}

function get(query = '') {
  return GET(request(query), { params: Promise.resolve({ wsId: 'alias' }) });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.enabled.mockReturnValue(true);
  mocks.auth.mockResolvedValue({
    ok: true,
    supabase: {},
    user: { id: 'actor' },
  });
  mocks.db.mockResolvedValue({});
  mocks.educationEnabled.mockResolvedValue(true);
  mocks.membership.mockResolvedValue({ ok: true });
  mocks.permissions.mockResolvedValue({
    containsPermission: (permission: string) =>
      permission === 'view_user_groups',
  });
  mocks.contact.mockResolvedValue({ workspace_user_id: learnerId });
  mocks.list.mockResolvedValue([]);
});

it('holds all catalog reads before authenticating or creating a privileged client', async () => {
  mocks.enabled.mockReturnValue(false);
  const response = await get('?view=staff');
  expect(response.status).toBe(404);
  expect((await response.json()).code).toBe('LMS_NOT_AVAILABLE');
  expect(mocks.auth).not.toHaveBeenCalled();
  expect(mocks.db).not.toHaveBeenCalled();
});

it.each([
  '?limit=51',
  '?limit=10&limit=20',
  '?view=staff&student_id=' + learnerId,
])('returns a stable invalid query code for %s', async (query) => {
  const response = await get(query);
  expect(response.status).toBe(400);
  expect((await response.json()).code).toBe('LMS_INVALID_QUERY');
  expect(mocks.list).not.toHaveBeenCalled();
});

it('requires authentication and returns an uncached stable error', async () => {
  mocks.auth.mockResolvedValue({
    ok: false,
    response: new NextResponse(null, { status: 401 }),
  });
  const response = await get();
  expect(response.status).toBe(401);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect((await response.json()).code).toBe('LMS_UNAUTHENTICATED');
  expect(mocks.subject).not.toHaveBeenCalled();
});

it('uses the verified guardian subject and returns only one requested page', async () => {
  mocks.subject.mockResolvedValue({
    wsId: 'guardian-workspace',
    studentWorkspaceUserId: 'authorized-contact',
    role: 'parent',
    readOnly: true,
  });
  mocks.list.mockResolvedValue([
    {
      id: classId,
      name: 'History',
      description: null,
      is_course_published: true,
    },
    {
      id: 'another-class',
      name: 'Art',
      description: null,
      is_course_published: true,
    },
  ]);
  const response = await get(`?student_id=${learnerId}&limit=1`);
  expect(mocks.auth).toHaveBeenCalledWith(expect.anything(), {
    allowAppSessionAuth: { targetApp: 'learn' },
  });
  expect(mocks.subject).toHaveBeenCalledWith(
    expect.objectContaining({ studentId: learnerId, wsId: 'alias' })
  );
  expect(mocks.list).toHaveBeenCalledWith(
    expect.objectContaining({
      limit: 2,
      scope: { kind: 'student', contactId: 'authorized-contact' },
      wsId: 'guardian-workspace',
    })
  );
  expect(await response.json()).toEqual({
    role: 'guardian',
    read_only: true,
    data: [
      {
        id: classId,
        name: 'History',
        description: null,
        is_course_published: true,
        updated_at: null,
      },
    ],
    next_cursor: classId,
  });
});

it('does not read classes for a staff request without group view permission', async () => {
  mocks.permissions.mockResolvedValue({ containsPermission: () => false });
  const response = await get('?view=staff');
  expect(response.status).toBe(403);
  expect((await response.json()).code).toBe('LMS_FORBIDDEN');
  expect(mocks.db).not.toHaveBeenCalled();
});

it('scopes a non-manager staff view to the actor’s own linked teacher contact', async () => {
  const response = await get(`?view=staff&after=${classId}`);
  expect(mocks.auth).toHaveBeenCalledWith(expect.anything(), {
    allowAppSessionAuth: { targetApp: 'teach' },
  });
  expect(mocks.list).toHaveBeenCalledWith(
    expect.objectContaining({
      after: classId,
      scope: { kind: 'teacher', contactId: learnerId },
      wsId: 'normalized-workspace',
    })
  );
  expect(await response.json()).toEqual({
    role: 'teacher',
    read_only: true,
    data: [],
    next_cursor: null,
  });
});

it('uses the workspace-wide catalog for group managers', async () => {
  mocks.permissions.mockResolvedValue({ containsPermission: () => true });
  const response = await get('?view=staff');
  expect(mocks.list).toHaveBeenCalledWith(
    expect.objectContaining({
      scope: { kind: 'administrator' },
      wsId: 'normalized-workspace',
    })
  );
  expect((await response.json()).role).toBe('administrator');
});
