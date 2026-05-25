import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createAdminClientMock = vi.fn();
const createClientMock = vi.fn();
const normalizeWorkspaceIdMock = vi.fn();
const resolveAuthenticatedSessionUserMock = vi.fn();
const updateEqBoardMock = vi.fn();
const updateEqWorkspaceMock = vi.fn();
const updateMock = vi.fn();
const verifyWorkspaceMembershipTypeMock = vi.fn();

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: (
    ...args: Parameters<typeof resolveAuthenticatedSessionUserMock>
  ) => resolveAuthenticatedSessionUserMock(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof createAdminClientMock>) =>
    createAdminClientMock(...args),
  createClient: (...args: Parameters<typeof createClientMock>) =>
    createClientMock(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: (
    ...args: Parameters<typeof normalizeWorkspaceIdMock>
  ) => normalizeWorkspaceIdMock(...args),
  verifyWorkspaceMembershipType: (
    ...args: Parameters<typeof verifyWorkspaceMembershipTypeMock>
  ) => verifyWorkspaceMembershipTypeMock(...args),
}));

import { PUT } from './route';

describe('task board boardId route PUT', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    createClientMock.mockResolvedValue({ from: vi.fn() });
    normalizeWorkspaceIdMock.mockResolvedValue('ws-1');
    resolveAuthenticatedSessionUserMock.mockResolvedValue({
      user: { id: 'user-1' },
      authError: null,
    });
    verifyWorkspaceMembershipTypeMock.mockResolvedValue({
      ok: true,
      error: null,
    });

    updateEqWorkspaceMock.mockResolvedValue({ error: null });
    updateEqBoardMock.mockReturnValue({ eq: updateEqWorkspaceMock });
    updateMock.mockReturnValue({ eq: updateEqBoardMock });
    createAdminClientMock.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table !== 'workspace_boards') {
          throw new Error(`Unexpected table: ${table}`);
        }

        return {
          update: updateMock,
        };
      }),
    });
  });

  it('returns a stable duplicate-name error when renaming to an existing board name', async () => {
    updateEqWorkspaceMock.mockResolvedValueOnce({
      error: {
        code: '23505',
        message:
          'duplicate key value violates unique constraint "idx_workspace_boards_unique_active_name"',
      },
    });

    const response = await PUT(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/task-boards/00000000-0000-4000-8000-000000000456',
        {
          method: 'PUT',
          body: JSON.stringify({
            name: 'Roadmap',
          }),
          headers: {
            'Content-Type': 'application/json',
          },
        }
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
          boardId: '00000000-0000-4000-8000-000000000456',
        }),
      }
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: 'TASK_BOARD_NAME_EXISTS',
      error: 'A task board with this name already exists',
    });
  });
});
