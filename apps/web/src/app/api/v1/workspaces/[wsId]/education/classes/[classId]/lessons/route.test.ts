import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(),
  auth: vi.fn(),
  subject: vi.fn(),
  subjectError: vi.fn(),
  staff: vi.fn(),
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
vi.mock('@/lib/education/lms-class-lessons', () => ({
  listLmsClassLessons: mocks.list,
}));
vi.mock('@/lib/education/lms-staff-access', () => ({
  resolveLmsStaffAccess: mocks.staff,
}));
vi.mock('@tuturuuu/education-core/tulearn/service', () => ({
  resolveTulearnSubject: mocks.subject,
  tulearnAccessErrorResponse: mocks.subjectError,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.db,
}));

import { GET } from './route';

const classId = 'c7100000-0000-4000-8000-000000000001';
const studentId = 'c7100000-0000-4000-8000-000000000002';
const lessonId = 'c7100000-0000-4000-8000-000000000003';

function get(query = '') {
  const request = new NextRequest(
    `https://tuturuuu.com/api/v1/workspaces/alias/education/classes/${classId}/lessons${query}`
  );
  return GET(request, { params: Promise.resolve({ wsId: 'alias', classId }) });
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
  mocks.subject.mockResolvedValue({
    role: 'student',
    readOnly: false,
    studentWorkspaceUserId: studentId,
    wsId: 'normalized-workspace',
  });
  mocks.staff.mockResolvedValue({
    db: {},
    wsId: 'normalized-workspace',
    scope: { kind: 'teacher', contactId: 'assigned-teacher' },
  });
  mocks.list.mockResolvedValue([]);
});

it('denies held requests before resolving identities or using the database', async () => {
  mocks.enabled.mockReturnValue(false);
  const responses = await Promise.all([get(), get('?view=staff')]);
  for (const response of responses) {
    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe('LMS_NOT_AVAILABLE');
  }
  expect(mocks.auth).not.toHaveBeenCalled();
  expect(mocks.db).not.toHaveBeenCalled();
});

it.each([
  '?limit=0',
  '?limit=10&limit=20',
  `?view=staff&student_id=${studentId}`,
  `?after=2147483648:${lessonId}`,
  `?after=1:${lessonId},id`,
])('rejects invalid input before authentication for %s', async (query) => {
  const response = await get(query);
  expect(response.status).toBe(400);
  expect((await response.json()).code).toBe('LMS_INVALID_QUERY');
  expect(mocks.auth).not.toHaveBeenCalled();
});

it('rejects unauthenticated access before resolving learner or staff permissions', async () => {
  mocks.auth.mockResolvedValue({
    ok: false,
    response: new NextResponse(null, { status: 401 }),
  });
  const response = await get();
  expect(response.status).toBe(401);
  expect((await response.json()).code).toBe('LMS_UNAUTHENTICATED');
  expect(mocks.subject).not.toHaveBeenCalled();
  expect(mocks.staff).not.toHaveBeenCalled();
});

it('reads the selected guardian subject and only returns outline fields', async () => {
  const courseLesson = {
    id: lessonId,
    name: 'Linear functions',
    sort_key: 2,
    is_published: true,
    content: 'private-field',
  };
  mocks.subject.mockResolvedValue({
    role: 'parent',
    readOnly: true,
    studentWorkspaceUserId: studentId,
    wsId: 'normalized-workspace',
  });
  mocks.list.mockResolvedValue([
    courseLesson,
    { ...courseLesson, id: 'second' },
  ]);
  const response = await get(
    `?student_id=${studentId}&after=-1:${lessonId}&limit=1`
  );
  expect(mocks.auth).toHaveBeenCalledWith(expect.anything(), {
    allowAppSessionAuth: { targetApp: 'learn' },
  });
  expect(mocks.subject).toHaveBeenCalledWith(
    expect.objectContaining({ studentId })
  );
  expect(mocks.list).toHaveBeenCalledWith(
    expect.objectContaining({
      after: { sortKey: -1, id: lessonId },
      classId,
      limit: 2,
      scope: { kind: 'student', contactId: studentId },
      wsId: 'normalized-workspace',
    })
  );
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(await response.json()).toEqual({
    class_id: classId,
    role: 'guardian',
    read_only: true,
    data: [
      {
        id: lessonId,
        name: 'Linear functions',
        sort_key: 2,
        is_published: true,
        updated_at: null,
      },
    ],
    next_cursor: `2:${lessonId}`,
  });
});

it('denies an unauthorized guardian subject before reading documents', async () => {
  mocks.subject.mockRejectedValue(new Error('Guardian link unavailable'));
  mocks.subjectError.mockReturnValue(new Response(null, { status: 403 }));
  const response = await get(`?student_id=${studentId}`);
  expect(response.status).toBe(403);
  expect((await response.json()).code).toBe('LMS_FORBIDDEN');
  expect(mocks.db).not.toHaveBeenCalled();
  expect(mocks.list).not.toHaveBeenCalled();
});

it('keeps the staff projection on the Teach audience and assigned class scope', async () => {
  mocks.list.mockResolvedValue([
    { id: lessonId, name: 'Draft lesson', sort_key: 2, is_published: false },
  ]);
  const response = await get('?view=staff');
  expect(mocks.auth).toHaveBeenCalledWith(expect.anything(), {
    allowAppSessionAuth: { targetApp: 'teach' },
  });
  expect(mocks.subject).not.toHaveBeenCalled();
  expect(mocks.list).toHaveBeenCalledWith(
    expect.objectContaining({
      scope: { kind: 'teacher', contactId: 'assigned-teacher' },
    })
  );
  expect(await response.json()).toMatchObject({
    role: 'teacher',
    data: [{ is_published: false }],
  });
});

it.each(['', '?view=staff'])(
  'conceals inaccessible classes for %s',
  async (query) => {
    mocks.list.mockResolvedValue(null);
    const response = await get(query);
    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe('LMS_CLASS_NOT_FOUND');
  }
);
