import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getPermissions: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  privateFrom: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
  normalizeWorkspaceId: mocks.normalizeWorkspaceId,
}));

import { handleGetApprovalsRequest } from './get';

const actor = { email: 'approver@example.com', id: 'platform-user-1' };
const context = { params: Promise.resolve({ wsId: 'workspace-alias' }) };

function createQueryBuilder<T>(result: T) {
  const builder = Promise.resolve(result) as Promise<T> & {
    eq: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    range: ReturnType<typeof vi.fn>;
  };
  builder.eq = vi.fn();
  builder.order = vi.fn();
  builder.range = vi.fn();
  builder.eq.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.range.mockResolvedValue(result);
  return builder;
}

function reportRow(
  overrides: Partial<Record<string, unknown>> = {}
): Record<string, unknown> {
  return {
    approved_at: null,
    content: 'Reviewed the weekly lesson.',
    created_at: '2026-07-20T09:00:00.000Z',
    creator_display_name: null,
    creator_email: null,
    creator_full_name: null,
    creator_id: 'creator-1',
    feedback: null,
    group_id: 'group-1',
    group_name: 'Advanced Vietnamese Group',
    id: 'report-1',
    modifier_display_name: null,
    modifier_email: null,
    modifier_full_name: null,
    rejection_reason: null,
    rejected_at: null,
    report_approval_status: 'PENDING',
    score: null,
    scores: null,
    title: 'Weekly report',
    updated_by: 'creator-1',
    user_display_name: null,
    user_email: null,
    user_full_name: null,
    user_id: 'recipient-1',
    ...overrides,
  };
}

describe('Contacts approvals GET handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeWorkspaceId.mockResolvedValue('workspace-1');
    mocks.getPermissions.mockResolvedValue({
      containsPermission: (permission: string) =>
        permission === 'approve_reports',
    });
  });

  function mockReportRows(rows: Record<string, unknown>[]) {
    const countQuery = createQueryBuilder({
      count: rows.length,
      error: null,
    });
    const dataQuery = createQueryBuilder({ data: rows, error: null });
    const select = vi.fn((_columns: string, options?: { head?: boolean }) =>
      options?.head ? countQuery : dataQuery
    );
    mocks.privateFrom.mockReturnValue({ select });
    mocks.createAdminClient.mockResolvedValue({
      schema: vi.fn().mockReturnValue({ from: mocks.privateFrom }),
    });
    return { select };
  }

  async function getReports() {
    const request = new Request(
      'https://contacts.tuturuuu.com/api/v1/workspaces/workspace-alias/users/approvals?kind=reports'
    );
    const response = await handleGetApprovalsRequest(request, context, actor);
    expect(response.status).toBe(200);
    return response.json();
  }

  it('prefers full names for report recipients and creators', async () => {
    mockReportRows([
      reportRow({
        creator_display_name: 'Creator Display',
        creator_email: 'creator@example.com',
        creator_full_name: 'Creator Full',
        modifier_display_name: 'Modifier Display',
        user_display_name: 'Recipient Display',
        user_email: 'recipient@example.com',
        user_full_name: 'Recipient Full',
      }),
    ]);

    const body = await getReports();

    expect(body.items[0]).toMatchObject({
      creator_name: 'Creator Full',
      modifier_name: 'Modifier Display',
      user_name: 'Recipient Full',
    });
  });

  it('falls back through display names and emails for historical reports', async () => {
    const { select } = mockReportRows([
      reportRow({
        creator_display_name: 'Creator Display',
        id: 'report-display',
        user_display_name: 'Recipient Display',
      }),
      reportRow({
        creator_email: 'creator@example.com',
        id: 'report-email',
        modifier_email: null,
        user_email: 'recipient@example.com',
      }),
    ]);

    const body = await getReports();

    expect(body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          creator_name: 'Creator Display',
          id: 'report-display',
          user_name: 'Recipient Display',
        }),
        expect.objectContaining({
          creator_name: 'creator@example.com',
          id: 'report-email',
          modifier_name: 'creator@example.com',
          user_name: 'recipient@example.com',
        }),
      ])
    );
    expect(
      select.mock.calls.some(([columns]) =>
        String(columns).includes('creator_display_name')
      )
    ).toBe(true);
    expect(
      select.mock.calls.some(([columns]) =>
        String(columns).includes('user_email')
      )
    ).toBe(true);
  });

  it('keeps unresolved historical names nullable for localized UI fallbacks', async () => {
    mockReportRows([reportRow()]);

    const body = await getReports();

    expect(body.items[0]).toMatchObject({
      creator_name: null,
      modifier_name: null,
      user_name: null,
    });
  });
});
