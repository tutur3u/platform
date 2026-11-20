import { NextRequest } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { lmsFailure } from '@/lib/education/lms-response';

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(),
  access: vi.fn(),
  list: vi.fn(),
}));

vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: async () => {},
}));
vi.mock('@/lib/education/learner-progress-flag', () => ({
  learnerProgressRoutesEnabled: mocks.enabled,
}));
vi.mock('@/lib/education/lms-view-access', () => ({
  resolveLmsViewAccess: mocks.access,
}));
vi.mock('@/lib/education/lms-learning-access', () => ({
  lmsLearningAccessFailure: () => null,
}));
vi.mock('@/lib/education/lms-class-schedule', () => ({
  listLmsClassSchedule: mocks.list,
}));

import { GET } from './route';

const classId = 'c7100000-0000-4000-8000-000000000001';
const contactId = 'c7100000-0000-4000-8000-000000000002';
const sessionId = 'c7100000-0000-4000-8000-000000000003';
const from = '2026-11-01T00:00:00Z';
const to = '2026-12-01T00:00:00Z';
const windowQuery = `from=${from}&to=${to}`;

function get(query = windowQuery) {
  const request = new NextRequest(
    `https://tuturuuu.com/api/v1/workspaces/alias/education/classes/${classId}/schedule?${query}`
  );
  return GET(request, { params: Promise.resolve({ wsId: 'alias', classId }) });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.enabled.mockReturnValue(true);
  mocks.access.mockResolvedValue({
    db: {},
    wsId: 'normalized-workspace',
    role: 'guardian',
    readOnly: true,
    scope: { kind: 'student', contactId },
  });
  mocks.list.mockResolvedValue([]);
});

it('returns the held response without resolving access or reading schedule data', async () => {
  mocks.enabled.mockReturnValue(false);
  const response = await get('');
  expect(response.status).toBe(404);
  expect((await response.json()).code).toBe('LMS_NOT_AVAILABLE');
  expect(mocks.access).not.toHaveBeenCalled();
});

it.each([
  '',
  'from=2026-11-01T00:00:00Z&to=2027-03-01T00:00:00Z',
  'from=2026-11-01&to=2026-12-01',
  `${windowQuery}&view=staff&student_id=${contactId}`,
  `${windowQuery}&updated_since=2026-11-10T00:00:00`,
  `${windowQuery}&after=2026-11-10T00:00:00Z|${sessionId},id`,
])(
  'rejects an invalid schedule query before authentication for %s',
  async (query) => {
    const response = await get(query);
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('LMS_INVALID_QUERY');
    expect(mocks.access).not.toHaveBeenCalled();
  }
);

it('preserves timestamp precision when reading and replaying a page', async () => {
  const updatedAt = '2026-11-09T00:00:00.999001+00:00';
  const startsAt = '2026-11-10T08:00:00.123456+07:00';
  const session = {
    id: sessionId,
    title: 'Chemistry',
    starts_at: startsAt,
    ends_at: '2026-11-10T09:00:00+07:00',
    start_timezone: 'Asia/Ho_Chi_Minh',
    end_timezone: 'Asia/Ho_Chi_Minh',
    status: 'cancelled',
    updated_at: updatedAt,
  };
  mocks.list.mockResolvedValueOnce([
    { ...session, description: 'private meeting notes' },
    { ...session, id: 'second' },
  ]);
  const response = await get(
    `${windowQuery}&student_id=${contactId}&limit=1&updated_since=${encodeURIComponent(updatedAt)}`
  );
  expect(mocks.access).toHaveBeenCalledWith(
    expect.objectContaining({
      wsId: 'alias',
      view: 'learning',
      studentId: contactId,
    })
  );
  expect(mocks.list).toHaveBeenCalledWith(
    expect.objectContaining({
      classId,
      from,
      to,
      updatedSince: updatedAt,
      limit: 2,
      scope: { kind: 'student', contactId },
      wsId: 'normalized-workspace',
    })
  );
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  const cursor = `${startsAt}|${sessionId}`;
  expect(await response.json()).toEqual({
    class_id: classId,
    role: 'guardian',
    data: [session],
    next_cursor: cursor,
  });
  await get(`${windowQuery}&after=${encodeURIComponent(cursor)}`);
  expect(mocks.list).toHaveBeenLastCalledWith(
    expect.objectContaining({
      after: { startsAt, id: sessionId },
    })
  );
});

it('denies unauthorized scopes and conceals missing classes', async () => {
  mocks.access.mockResolvedValueOnce({
    error: lmsFailure(403, 'LMS_FORBIDDEN', 'LMS access is denied'),
  });
  const denied = await get(`${windowQuery}&view=staff`);
  expect(denied.status).toBe(403);
  expect(mocks.list).not.toHaveBeenCalled();
  mocks.list.mockResolvedValueOnce(null);
  const missing = await get(`${windowQuery}&view=staff`);
  expect(missing.status).toBe(404);
  expect((await missing.json()).code).toBe('LMS_CLASS_NOT_FOUND');
});
