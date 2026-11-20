import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(),
  auth: vi.fn(),
  staff: vi.fn(),
  learning: vi.fn(),
  learningError: vi.fn(),
  tuition: vi.fn(),
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
vi.mock('@/lib/education/lms-learning-access', () => ({
  lmsLearningAccessFailure: mocks.learningError,
  resolveLmsLearningAccess: mocks.learning,
}));
vi.mock('@/lib/finance/class-tuition', () => ({
  listClassTuition: mocks.tuition,
}));

import { GET } from './route';

const classId = 'c7200000-0000-4000-8000-000000000001';
const learnerId = 'c7200000-0000-4000-8000-000000000002';
const after = 'c7200000-0000-4000-8000-000000000003';
const db = {};
const actor = { ok: true, user: { id: 'actor' } };

function get(query = 'month=2026-11') {
  const request = new NextRequest(
    `https://tuturuuu.com/api/v1/workspaces/alias/finance/classes/${classId}/tuition?${query}`
  );
  return GET(request, { params: Promise.resolve({ wsId: 'alias', classId }) });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.enabled.mockReturnValue(true);
  mocks.auth.mockResolvedValue(actor);
  mocks.staff.mockResolvedValue({
    db,
    wsId: 'verified',
    canViewInvoices: true,
    scope: { kind: 'teacher', contactId: 'teacher-contact' },
  });
  mocks.learning.mockResolvedValue({
    db,
    wsId: 'verified',
    role: 'guardian',
    scope: { kind: 'student', contactId: 'verified-contact' },
  });
  mocks.tuition.mockResolvedValue({
    data: [{ contact_id: 'verified-contact', status: 'paid' }],
    nextCursor: null,
  });
});

it('returns 404 without querying sessions or Finance while the source gate is off', async () => {
  mocks.enabled.mockReturnValue(false);
  expect((await get()).status).toBe(404);
  expect(mocks.auth).not.toHaveBeenCalled();
  expect(mocks.tuition).not.toHaveBeenCalled();
});

it.each([
  'month=2026-13',
  'month=2026-11&month=2026-10',
  `month=2026-11&view=student&after=${after}`,
  `month=2026-11&view=learning&after=${after}`,
  `month=2026-11&view=staff&student_id=${learnerId}`,
])('rejects invalid input %s before authentication', async (query) => {
  expect((await get(query)).status).toBe(400);
  expect(mocks.auth).not.toHaveBeenCalled();
});

it('rejects an unauthenticated request before reading billing', async () => {
  mocks.auth.mockResolvedValue({
    ok: false,
    response: new NextResponse(null, { status: 401 }),
  });
  expect((await get()).status).toBe(401);
  expect(mocks.tuition).not.toHaveBeenCalled();
});

it('requires invoice view permission before reading a staff roster', async () => {
  mocks.staff.mockResolvedValue({ canViewInvoices: false });
  expect((await get('month=2026-11&view=staff')).status).toBe(403);
  expect(mocks.auth).toHaveBeenCalledWith(expect.anything(), {
    allowAppSessionAuth: { targetApp: 'teach' },
  });
  expect(mocks.tuition).not.toHaveBeenCalled();
});

it('uses the verified guardian subject and returns a private projection', async () => {
  const response = await get(`month=2026-11&student_id=${learnerId}`);
  expect(mocks.auth).toHaveBeenCalledWith(expect.anything(), {
    allowAppSessionAuth: { targetApp: 'learn' },
  });
  expect(mocks.learning).toHaveBeenCalledWith(actor, 'alias', learnerId);
  expect(mocks.tuition).toHaveBeenCalledWith({
    classId,
    db,
    limit: 1,
    month: '2026-11',
    scope: { kind: 'student', contactId: 'verified-contact' },
    wsId: 'verified',
  });
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(await response.json()).toEqual({
    class_id: classId,
    month: '2026-11',
    role: 'guardian',
    data: [{ contact_id: 'verified-contact', status: 'paid' }],
    next_cursor: null,
  });
});

it('conceals inaccessible classes from an authorized staff caller', async () => {
  mocks.tuition.mockResolvedValue(null);
  const response = await get(`month=2026-11&view=staff&after=${after}`);
  expect(mocks.tuition).toHaveBeenCalledWith(
    expect.objectContaining({
      after,
      scope: { kind: 'teacher', contactId: 'teacher-contact' },
    })
  );
  expect(response.status).toBe(404);
  expect((await response.json()).code).toBe('FINANCE_CLASS_NOT_FOUND');
});
