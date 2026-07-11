import { isValidElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  containsPermission: vi.fn(),
  createAdminClient: vi.fn(),
  editableReportPreview: vi.fn(() => null),
  getLocale: vi.fn(() => Promise.resolve('en')),
  getPermissions: vi.fn(),
  getTranslations: vi.fn(() => Promise.resolve((key: string) => key)),
  notFound: vi.fn(() => {
    throw new Error('not-found');
  }),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
}));

vi.mock('next-intl/server', () => ({
  getLocale: (...args: Parameters<typeof mocks.getLocale>) =>
    mocks.getLocale(...args),
  getTranslations: (...args: Parameters<typeof mocks.getTranslations>) =>
    mocks.getTranslations(...args),
}));

vi.mock('next/navigation', () => ({
  notFound: (...args: Parameters<typeof mocks.notFound>) =>
    mocks.notFound(...args),
  redirect: vi.fn(),
}));

vi.mock('../../filters', () => ({
  Filter: () => null,
}));

vi.mock('./editable-report-preview', () => ({
  default: mocks.editableReportPreview,
}));

function createQueryResult<T>(result: T) {
  const query = Object.assign(Promise.resolve(result), {
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    order: vi.fn(() => query),
    select: vi.fn(() => query),
  });

  return query;
}

function findElementByType(node: ReactNode, type: unknown): any {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElementByType(child, type);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  if (node.type === type) return node;
  return findElementByType(
    (node.props as { children?: ReactNode }).children,
    type
  );
}

describe('user report detail page permissions', () => {
  it('passes create permission to the report editor when creating a report', async () => {
    mocks.containsPermission.mockImplementation((permission: string) =>
      [
        'view_user_groups_reports',
        'create_user_groups_reports',
        'check_user_attendance',
      ].includes(permission)
    );
    mocks.getPermissions.mockResolvedValue({
      containsPermission: mocks.containsPermission,
    });

    const reportQuery = createQueryResult({ count: 0, data: [], error: null });

    mocks.createAdminClient.mockResolvedValue({
      from: (table: string) => {
        if (table === 'workspace_user_groups_with_amount') {
          return createQueryResult({
            count: 1,
            data: [{ amount: 1, id: 'group-1', name: 'Group 1' }],
            error: null,
          });
        }
        if (table === 'workspace_configs') {
          return createQueryResult({ data: [], error: null });
        }
        throw new Error(`Unexpected table ${table}`);
      },
      rpc: () =>
        createQueryResult({
          count: 1,
          data: [
            {
              archived: false,
              archived_until: null,
              full_name: 'Member One',
              id: 'user-1',
            },
          ],
          error: null,
        }),
      schema: (schema: string) => {
        if (schema !== 'private') {
          throw new Error(`Unexpected schema ${schema}`);
        }

        return {
          from: (table: string) => {
            if (
              table === 'external_user_monthly_reports' ||
              table === 'external_user_monthly_reports_workspace_view'
            ) {
              return reportQuery;
            }
            throw new Error(`Unexpected private table ${table}`);
          },
        };
      },
    });

    const { default: WorkspaceUserDetailsPage } = await import('./page');
    const page = await WorkspaceUserDetailsPage({
      params: Promise.resolve({ reportId: 'new', wsId: 'ws-1' }),
      searchParams: Promise.resolve({
        groupId: 'group-1',
        page: '1',
        pageSize: '20',
        q: '',
        userId: 'user-1',
      }),
    });

    const editor = findElementByType(page, mocks.editableReportPreview);

    expect(mocks.getPermissions).toHaveBeenCalledWith({ wsId: 'ws-1' });
    expect(editor.props).toMatchObject({
      canApproveReports: false,
      canCheckUserAttendance: true,
      canCreateReports: true,
      canDeleteReports: false,
      canUpdateReports: false,
      isNew: true,
      wsId: 'ws-1',
    });
  });
});
