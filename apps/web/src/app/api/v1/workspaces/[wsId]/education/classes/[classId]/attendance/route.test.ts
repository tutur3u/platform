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
vi.mock('@/lib/education/lms-class-attendance', () => ({
  listLmsClassAttendance: mocks.list,
}));

import { GET } from './route';

const classId = 'c7100000-0000-4000-8000-000000000001';
const contactId = 'c7100000-0000-4000-8000-000000000002';
const markId = 'c7100000-0000-4000-8000-000000000003';
const windowQuery = 'from=2026-11-01&to=2026-12-01';

function get(query = windowQuery) {
  const request = new NextRequest(
    `https://tuturuuu.com/api/v1/workspaces/alias/education/classes/${classId}/attendance?${query}`
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

it('honors the off switch before parsing, authentication, or data reads', async () => {
  mocks.enabled.mockReturnValue(false);
  const response = await get('');
  expect(response.status).toBe(404);
  expect((await response.json()).code).toBe('LMS_NOT_AVAILABLE');
  expect(mocks.access).not.toHaveBeenCalled();
  expect(mocks.list).not.toHaveBeenCalled();
});

it.each([
  '',
  'from=2026-11-01&to=2027-03-01',
  'from=2026-11-01&to=2026-11-01',
  'from=2026-02-29&to=2026-03-01',
  `${windowQuery}&from=2026-10-01`,
  `${windowQuery}&view=staff&student_id=${contactId}`,
  `${windowQuery}&after=2026-12-01:${markId}`,
  `${windowQuery}&after=2026-11-10:${markId},id`,
])(
  'rejects an invalid attendance query before authentication for %s',
  async (query) => {
    const response = await get(query);
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('LMS_INVALID_QUERY');
    expect(mocks.access).not.toHaveBeenCalled();
  }
);

it('returns access denials without reading attendance', async () => {
  mocks.access.mockResolvedValue({
    error: lmsFailure(403, 'LMS_FORBIDDEN', 'LMS access is denied'),
  });
  const response = await get(`${windowQuery}&view=staff`);
  expect(response.status).toBe(403);
  expect((await response.json()).code).toBe('LMS_FORBIDDEN');
  expect(mocks.list).not.toHaveBeenCalled();
});

it('projects the authorized guardian subject without staff notes', async () => {
  const mark = {
    id: markId,
    date: '2026-11-10',
    user_id: contactId,
    session_id: null,
    status: 'PRESENT',
    notes: 'private staff note',
  };
  mocks.list.mockResolvedValue([mark, { ...mark, id: 'second' }]);
  const response = await get(
    `${windowQuery}&student_id=${contactId}&after=2026-11-09:${markId}&limit=1`
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
      after: { date: '2026-11-09', id: markId },
      classId,
      from: '2026-11-01',
      to: '2026-12-01',
      limit: 2,
      scope: { kind: 'student', contactId },
      wsId: 'normalized-workspace',
    })
  );
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(await response.json()).toEqual({
    class_id: classId,
    role: 'guardian',
    data: [
      {
        id: markId,
        date: mark.date,
        contact_id: contactId,
        session_id: null,
        status: 'PRESENT',
        updated_at: null,
      },
    ],
    next_cursor: `2026-11-10:${markId}`,
  });
});

it('keeps inaccessible classes distinct from empty results for assigned teachers', async () => {
  mocks.access.mockResolvedValue({
    db: {},
    wsId: 'normalized-workspace',
    role: 'teacher',
    scope: { kind: 'teacher', contactId },
    readOnly: true,
  });
  mocks.list.mockResolvedValueOnce(null);
  const query = `${windowQuery}&view=staff`;
  const missing = await get(query);
  expect(missing.status).toBe(404);
  expect((await missing.json()).code).toBe('LMS_CLASS_NOT_FOUND');
  const empty = await get(query);
  expect(await empty.json()).toEqual({
    class_id: classId,
    role: 'teacher',
    data: [],
    next_cursor: null,
  });
});
