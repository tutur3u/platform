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
vi.mock('@/lib/education/lms-class-tuition-invoices', () => ({
  listLmsClassTuitionInvoices: mocks.list,
}));

import { GET } from './route';

const classId = 'c7100000-0000-4000-8000-000000000001';
const contactId = 'c7100000-0000-4000-8000-000000000002';
const invoiceId = 'c7100000-0000-4000-8000-000000000003';

function get(query = '') {
  const request = new NextRequest(
    `https://tuturuuu.com/api/v1/workspaces/alias/education/classes/${classId}/tuition-invoices${query}`
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
  mocks.staff.mockResolvedValue({
    db: {},
    wsId: 'normalized-workspace',
    canViewInvoices: true,
    scope: { kind: 'teacher', contactId: 'teacher-contact' },
  });
  mocks.list.mockResolvedValue([]);
});

it('honors the off switch before authenticating', async () => {
  mocks.enabled.mockReturnValue(false);
  const response = await get();
  expect(response.status).toBe(404);
  expect((await response.json()).code).toBe('LMS_NOT_AVAILABLE');
  expect(mocks.auth).not.toHaveBeenCalled();
});

it.each(['?limit=51', '?student_id=any', '?after=invalid', '?limit=1&limit=2'])(
  'rejects invalid queries before authentication for %s',
  async (query) => {
    const response = await get(query);
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('LMS_INVALID_QUERY');
    expect(mocks.auth).not.toHaveBeenCalled();
  }
);

it('requires an authenticated platform or Teach audience', async () => {
  mocks.auth.mockResolvedValue({
    ok: false,
    response: new NextResponse(null, { status: 401 }),
  });
  const response = await get();
  expect(response.status).toBe(401);
  expect(mocks.auth).toHaveBeenCalledWith(expect.anything(), {
    allowAppSessionAuth: { targetApp: 'teach' },
  });
  expect(mocks.staff).not.toHaveBeenCalled();
  expect(mocks.list).not.toHaveBeenCalled();
});

it.each(['administrator', 'teacher'])(
  'does not query Finance for a %s without invoice view permission',
  async (role) => {
    mocks.staff.mockResolvedValue({
      db: {},
      wsId: 'normalized-workspace',
      canViewInvoices: false,
      scope: { kind: role, contactId: 'teacher-contact' },
    });
    const response = await get();
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('LMS_FORBIDDEN');
    expect(mocks.list).not.toHaveBeenCalled();
  }
);

it('returns the permitted invoice period and completion without billing details', async () => {
  const data = {
    invoice_id: invoiceId,
    invoice: {
      customer_id: contactId,
      completed_at: '2026-11-10T02:00:00Z',
      subscription_months: ['2026-11-01'],
      valid_until: '2026-12-01T00:00:00Z',
      paid_amount: 100,
      note: 'Internal note',
    },
  };
  mocks.list.mockResolvedValue([data, { ...data, invoice_id: 'second' }]);
  const response = await get(`?contact_id=${contactId}&limit=1`);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(mocks.list).toHaveBeenCalledWith(
    expect.objectContaining({
      classId,
      contactId,
      limit: 2,
      scope: { kind: 'teacher', contactId: 'teacher-contact' },
      wsId: 'normalized-workspace',
    })
  );
  expect(await response.json()).toEqual({
    class_id: classId,
    role: 'teacher',
    data: [
      {
        invoice_id: invoiceId,
        contact_id: contactId,
        completed_at: data.invoice.completed_at,
        status: 'completed',
        subscription_months: data.invoice.subscription_months,
        valid_until: data.invoice.valid_until,
        updated_at: null,
      },
    ],
    next_cursor: invoiceId,
  });
});

it('conceals a missing or unassigned class even for an invoice viewer', async () => {
  mocks.list.mockResolvedValue(null);
  const response = await get();
  expect(response.status).toBe(404);
  expect((await response.json()).code).toBe('LMS_CLASS_NOT_FOUND');
});
