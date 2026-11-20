import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(),
  auth: vi.fn(),
  staff: vi.fn(),
  list: vi.fn(),
}));

vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: async () => {},
}));
vi.mock('@/lib/api-auth', () => ({ resolveSessionAuthContext: mocks.auth }));
vi.mock('@/lib/education/learner-progress-flag', () => ({
  learnerProgressRoutesEnabled: mocks.enabled,
}));
vi.mock('@/lib/education/lms-staff-access', () => ({
  resolveLmsStaffAccess: mocks.staff,
}));
vi.mock('@/lib/education/lms-class-roster', () => ({
  listLmsClassRoster: mocks.list,
}));

import { GET } from './route';

const classId = 'c7400000-0000-4000-8000-000000000001';
const contactId = 'c7400000-0000-4000-8000-000000000002';

function get(query = '') {
  return GET(
    new NextRequest(
      `https://tuturuuu.com/api/v1/workspaces/alias/education/classes/${classId}/roster${query}`
    ),
    {
      params: Promise.resolve({ wsId: 'alias', classId }),
    }
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.enabled.mockReturnValue(true);
  mocks.auth.mockResolvedValue({
    ok: true,
    supabase: {},
    user: { id: 'actor' },
  });
  mocks.staff.mockResolvedValue({
    db: {},
    wsId: 'resolved-workspace',
    scope: { kind: 'teacher', contactId },
    canViewContactNames: true,
  });
});

it('holds roster reads before authenticating', async () => {
  mocks.enabled.mockReturnValue(false);
  const response = await get();
  expect(response.status).toBe(404);
  expect((await response.json()).code).toBe('LMS_NOT_AVAILABLE');
  expect(mocks.auth).not.toHaveBeenCalled();
});

it('denies unauthenticated callers before resolving staff access', async () => {
  mocks.auth.mockResolvedValue({
    ok: false,
    response: new NextResponse(null, { status: 401 }),
  });
  const response = await get();
  expect(response.status).toBe(401);
  expect((await response.json()).code).toBe('LMS_UNAUTHENTICATED');
  expect(mocks.staff).not.toHaveBeenCalled();
});

it('does not read the roster without permission to see Contacts names', async () => {
  mocks.staff.mockResolvedValue({ canViewContactNames: false });
  const response = await get();
  expect(response.status).toBe(403);
  expect((await response.json()).code).toBe('LMS_FORBIDDEN');
  expect(mocks.list).not.toHaveBeenCalled();
});

it('does not distinguish an unassigned group from an absent class', async () => {
  mocks.list.mockResolvedValue(null);
  const response = await get();
  expect(response.status).toBe(404);
  expect((await response.json()).code).toBe('LMS_CLASS_NOT_FOUND');
});

it('uses the authenticated teacher scope and returns the last visible contact as the next cursor', async () => {
  const member = {
    contact_id: contactId,
    name: 'Alex',
    role: 'STUDENT',
    joined_at: null,
    updated_at: null,
  };
  mocks.list.mockResolvedValue([
    member,
    { ...member, contact_id: 'following-contact' },
  ]);
  const response = await get(`?after=${classId}&limit=1`);
  expect(mocks.auth).toHaveBeenCalledWith(expect.anything(), {
    allowAppSessionAuth: { targetApp: 'teach' },
  });
  expect(mocks.list).toHaveBeenCalledWith(
    expect.objectContaining({
      wsId: 'resolved-workspace',
      scope: { kind: 'teacher', contactId },
      classId,
      after: classId,
      limit: 2,
    })
  );
  expect(await response.json()).toEqual({
    class_id: classId,
    role: 'teacher',
    data: [member],
    next_cursor: contactId,
  });
  expect(response.headers.get('cache-control')).toBe('private, no-store');
});
