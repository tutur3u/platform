import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const CATEGORY_ID = '33333333-3333-4333-8333-333333333333';
const GROUP_ID = '22222222-2222-4222-8222-222222222222';
const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';

const mocks = vi.hoisted(() => {
  const categoryMaybeSingle = vi.fn();
  const deleteCategoryWsEq = vi.fn();
  const deleteLinkEq = vi.fn();
  const groupMaybeSingle = vi.fn();
  const hasPermission = vi.fn(() => true);
  const serverLoggerError = vi.fn();

  const adminSupabase = {
    from: vi.fn((table: string) => {
      if (table === 'workspace_user_groups') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({ maybeSingle: groupMaybeSingle })),
            })),
          })),
        };
      }

      return {};
    }),
    schema: vi.fn(() => ({
      from: vi.fn((table: string) => {
        if (table === 'user_group_metric_categories') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({ maybeSingle: categoryMaybeSingle })),
              })),
            })),
            delete: vi.fn(() => ({
              eq: vi.fn(() => ({ eq: deleteCategoryWsEq })),
            })),
          };
        }

        if (table === 'user_group_metric_category_links') {
          return {
            delete: vi.fn(() => ({ eq: deleteLinkEq })),
          };
        }

        return {};
      }),
    })),
  };

  return {
    adminSupabase,
    categoryMaybeSingle,
    deleteCategoryWsEq,
    deleteLinkEq,
    groupMaybeSingle,
    hasPermission,
    serverLoggerError,
  };
});

vi.mock('@tuturuuu/utils/workspace-helper', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tuturuuu/utils/workspace-helper')>();
  return {
    ...actual,
    getPermissions: vi.fn(async () => ({
      containsPermission: mocks.hasPermission,
    })),
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminSupabase)),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: mocks.serverLoggerError,
  },
}));

describe('user group indicator category item route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.hasPermission.mockReturnValue(true);
    mocks.groupMaybeSingle.mockResolvedValue({
      data: { id: GROUP_ID },
      error: null,
    });
    mocks.categoryMaybeSingle.mockResolvedValue({
      data: { id: CATEGORY_ID },
      error: null,
    });
    mocks.deleteLinkEq.mockResolvedValue({ data: null, error: null });
    mocks.deleteCategoryWsEq.mockResolvedValue({ data: null, error: null });
  });

  it('unlinks category relationships without deleting metrics', async () => {
    const { DELETE } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/user-groups/[groupId]/indicators/categories/[categoryId]/route'
    );

    const response = await DELETE(
      new NextRequest(
        `http://localhost/api/v1/workspaces/${WORKSPACE_ID}/user-groups/${GROUP_ID}/indicators/categories/${CATEGORY_ID}`,
        { method: 'DELETE' }
      ),
      {
        params: Promise.resolve({
          categoryId: CATEGORY_ID,
          groupId: GROUP_ID,
          wsId: WORKSPACE_ID,
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.adminSupabase.schema).toHaveBeenCalledWith('private');
    expect(mocks.deleteLinkEq).toHaveBeenCalledWith('category_id', CATEGORY_ID);
    expect(mocks.deleteCategoryWsEq).toHaveBeenCalledWith(
      'ws_id',
      WORKSPACE_ID
    );
    expect(mocks.adminSupabase.from).not.toHaveBeenCalledWith(
      'user_group_metrics'
    );
  });

  it('returns not found for a category outside the workspace', async () => {
    mocks.categoryMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });
    const { DELETE } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/user-groups/[groupId]/indicators/categories/[categoryId]/route'
    );

    const response = await DELETE(
      new NextRequest(
        `http://localhost/api/v1/workspaces/${WORKSPACE_ID}/user-groups/${GROUP_ID}/indicators/categories/${CATEGORY_ID}`,
        { method: 'DELETE' }
      ),
      {
        params: Promise.resolve({
          categoryId: CATEGORY_ID,
          groupId: GROUP_ID,
          wsId: WORKSPACE_ID,
        }),
      }
    );

    expect(response.status).toBe(404);
    expect(mocks.deleteLinkEq).not.toHaveBeenCalled();
  });

  it('returns not found when the user group is outside the workspace', async () => {
    mocks.groupMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: null,
    });
    const { DELETE } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/user-groups/[groupId]/indicators/categories/[categoryId]/route'
    );

    const response = await DELETE(
      new NextRequest(
        `http://localhost/api/v1/workspaces/${WORKSPACE_ID}/user-groups/${GROUP_ID}/indicators/categories/${CATEGORY_ID}`,
        { method: 'DELETE' }
      ),
      {
        params: Promise.resolve({
          categoryId: CATEGORY_ID,
          groupId: GROUP_ID,
          wsId: WORKSPACE_ID,
        }),
      }
    );

    expect(response.status).toBe(404);
    expect(mocks.deleteLinkEq).not.toHaveBeenCalled();
  });

  it('rejects callers without score deletion permission', async () => {
    mocks.hasPermission.mockReturnValueOnce(false);
    const { DELETE } = await import(
      '@/legacy-api-routes/v1/workspaces/[wsId]/user-groups/[groupId]/indicators/categories/[categoryId]/route'
    );

    const response = await DELETE(
      new NextRequest(
        `http://localhost/api/v1/workspaces/${WORKSPACE_ID}/user-groups/${GROUP_ID}/indicators/categories/${CATEGORY_ID}`,
        { method: 'DELETE' }
      ),
      {
        params: Promise.resolve({
          categoryId: CATEGORY_ID,
          groupId: GROUP_ID,
          wsId: WORKSPACE_ID,
        }),
      }
    );

    expect(response.status).toBe(403);
    expect(mocks.deleteLinkEq).not.toHaveBeenCalled();
  });
});
