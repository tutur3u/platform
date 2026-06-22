import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPermissionsMock = vi.fn();
const verifyWorkspaceMembershipTypeMock = vi.fn();

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof getPermissionsMock>) =>
    getPermissionsMock(...args),
  verifyWorkspaceMembershipType: (
    ...args: Parameters<typeof verifyWorkspaceMembershipTypeMock>
  ) => verifyWorkspaceMembershipTypeMock(...args),
}));

import {
  normalizeTaskBoardShareEmail,
  resolveTaskBoardAccess,
  strongestTaskBoardGuestPermission,
} from './board-access';

type QueryResult = {
  data: unknown;
  error: unknown;
};

function createQuery(result: QueryResult) {
  const query = {
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    is: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
    order: vi.fn(() => query),
    select: vi.fn(() => query),
  };
  Object.defineProperty(query, 'then', {
    value: (
      resolve: (value: QueryResult) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject),
  });

  return query;
}

function createSupabaseMock(results: Record<string, QueryResult[]>) {
  return {
    from: vi.fn((table: string) => {
      const result = results[table]?.shift() ?? { data: [], error: null };
      return createQuery(result);
    }),
  } as unknown as TypedSupabaseClient;
}

describe('task board direct share access', () => {
  const user = {
    aud: 'authenticated',
    email: 'Guest@Example.COM',
    id: '00000000-0000-4000-8000-000000000001',
  } as SupabaseUser;

  beforeEach(() => {
    vi.clearAllMocks();
    getPermissionsMock.mockResolvedValue({
      containsPermission: vi.fn().mockReturnValue(true),
    });
    verifyWorkspaceMembershipTypeMock.mockResolvedValue({ ok: false });
  });

  it('normalizes share emails and chooses the strongest permission', () => {
    expect(normalizeTaskBoardShareEmail(' Guest@Example.COM ')).toBe(
      'guest@example.com'
    );
    expect(strongestTaskBoardGuestPermission(['view', 'edit'])).toBe('edit');
    expect(strongestTaskBoardGuestPermission([null, undefined])).toBeNull();
  });

  it('returns member edit access before checking direct shares', async () => {
    verifyWorkspaceMembershipTypeMock.mockResolvedValue({ ok: true });
    const supabase = createSupabaseMock({});
    const sbAdmin = createSupabaseMock({
      workspace_boards: [
        {
          data: {
            id: '00000000-0000-4000-8000-000000000010',
            ws_id: '00000000-0000-4000-8000-000000000020',
          },
          error: null,
        },
      ],
    });

    const result = await resolveTaskBoardAccess({
      boardId: '00000000-0000-4000-8000-000000000010',
      sbAdmin,
      supabase,
      user,
      wsId: '00000000-0000-4000-8000-000000000020',
    });

    expect(result).toMatchObject({
      access: { mode: 'member', permission: 'edit' },
    });
    expect((sbAdmin as any).from).toHaveBeenCalledTimes(1);
  });

  it('rejects a workspace member without manage_projects when no direct share exists', async () => {
    verifyWorkspaceMembershipTypeMock.mockResolvedValue({ ok: true });
    getPermissionsMock.mockResolvedValue({
      containsPermission: vi.fn().mockReturnValue(false),
    });
    const supabase = createSupabaseMock({});
    const sbAdmin = createSupabaseMock({
      workspace_boards: [
        {
          data: {
            id: '00000000-0000-4000-8000-000000000010',
            ws_id: '00000000-0000-4000-8000-000000000020',
          },
          error: null,
        },
      ],
      task_board_shares: [
        { data: [], error: null },
        { data: [], error: null },
      ],
    });

    const result = await resolveTaskBoardAccess({
      boardId: '00000000-0000-4000-8000-000000000010',
      sbAdmin,
      supabase,
      user,
      wsId: '00000000-0000-4000-8000-000000000020',
    });

    expect(result).toMatchObject({
      error: expect.objectContaining({ status: 403 }),
    });
  });

  it('allows a workspace member without manage_projects through a direct board share', async () => {
    verifyWorkspaceMembershipTypeMock.mockResolvedValue({ ok: true });
    getPermissionsMock.mockResolvedValue({
      containsPermission: vi.fn().mockReturnValue(false),
    });
    const supabase = createSupabaseMock({});
    const sbAdmin = createSupabaseMock({
      workspace_boards: [
        {
          data: {
            id: '00000000-0000-4000-8000-000000000010',
            ws_id: '00000000-0000-4000-8000-000000000020',
          },
          error: null,
        },
      ],
      task_board_shares: [
        { data: [], error: null },
        {
          data: [
            {
              id: '00000000-0000-4000-8000-000000000030',
              board_id: '00000000-0000-4000-8000-000000000010',
              permission: 'edit',
              shared_with_email: 'guest@example.com',
              workspace_boards: {
                id: '00000000-0000-4000-8000-000000000010',
                ws_id: '00000000-0000-4000-8000-000000000020',
                name: 'Roadmap',
              },
            },
          ],
          error: null,
        },
      ],
    });

    const result = await resolveTaskBoardAccess({
      boardId: '00000000-0000-4000-8000-000000000010',
      requiredPermission: 'edit',
      sbAdmin,
      supabase,
      user,
      wsId: '00000000-0000-4000-8000-000000000020',
    });

    expect(result).toMatchObject({
      access: { mode: 'guest', permission: 'edit' },
      boardId: '00000000-0000-4000-8000-000000000010',
    });
  });

  it('allows a non-member recipient to view a directly shared board', async () => {
    const supabase = createSupabaseMock({});
    const sbAdmin = createSupabaseMock({
      workspace_boards: [
        {
          data: {
            id: '00000000-0000-4000-8000-000000000010',
            ws_id: '00000000-0000-4000-8000-000000000020',
          },
          error: null,
        },
      ],
      task_board_shares: [
        { data: [], error: null },
        {
          data: [
            {
              id: '00000000-0000-4000-8000-000000000030',
              board_id: '00000000-0000-4000-8000-000000000010',
              permission: 'view',
              shared_with_email: 'guest@example.com',
              workspace_boards: {
                id: '00000000-0000-4000-8000-000000000010',
                ws_id: '00000000-0000-4000-8000-000000000020',
                name: 'Roadmap',
              },
            },
          ],
          error: null,
        },
      ],
    });

    const result = await resolveTaskBoardAccess({
      boardId: '00000000-0000-4000-8000-000000000010',
      sbAdmin,
      supabase,
      user,
      wsId: '00000000-0000-4000-8000-000000000020',
    });

    expect(result).toMatchObject({
      access: { mode: 'guest', permission: 'view' },
      boardId: '00000000-0000-4000-8000-000000000010',
    });
  });

  it('rejects a view-only direct share when edit access is required', async () => {
    const supabase = createSupabaseMock({});
    const sbAdmin = createSupabaseMock({
      workspace_boards: [
        {
          data: {
            id: '00000000-0000-4000-8000-000000000010',
            ws_id: '00000000-0000-4000-8000-000000000020',
          },
          error: null,
        },
      ],
      task_board_shares: [
        { data: [], error: null },
        {
          data: [
            {
              id: '00000000-0000-4000-8000-000000000030',
              board_id: '00000000-0000-4000-8000-000000000010',
              permission: 'view',
              shared_with_email: 'guest@example.com',
              workspace_boards: {
                id: '00000000-0000-4000-8000-000000000010',
                ws_id: '00000000-0000-4000-8000-000000000020',
              },
            },
          ],
          error: null,
        },
      ],
    });

    const result = await resolveTaskBoardAccess({
      boardId: '00000000-0000-4000-8000-000000000010',
      requiredPermission: 'edit',
      sbAdmin,
      supabase,
      user,
      wsId: '00000000-0000-4000-8000-000000000020',
    });

    expect(result).toMatchObject({
      error: expect.objectContaining({ status: 403 }),
    });
  });
});
