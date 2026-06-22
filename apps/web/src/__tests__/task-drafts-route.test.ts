import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const membershipSingle = vi.fn();
  const taskDraftsEq = vi.fn();
  const taskDraftsOr = vi.fn();
  const taskDraftsOrder = vi.fn();
  const taskDraftsQuery = {
    eq: taskDraftsEq,
    or: taskDraftsOr,
    order: taskDraftsOrder,
  };

  taskDraftsEq.mockReturnValue(taskDraftsQuery);
  taskDraftsOr.mockReturnValue(taskDraftsQuery);

  const sessionSupabase = {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn((table: string) => {
      if (table === 'workspace_members') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: membershipSingle,
              }),
            }),
          }),
        };
      }

      if (table === 'task_drafts') {
        throw new Error('task_drafts should be queried with the admin client');
      }

      throw new Error(`Unexpected session table: ${table}`);
    }),
  };

  const adminSupabase = {
    from: vi.fn((table: string) => {
      if (table === 'task_drafts') {
        return {
          select: vi.fn().mockReturnValue(taskDraftsQuery),
        };
      }

      throw new Error(`Unexpected admin table: ${table}`);
    }),
  };

  return {
    adminSupabase,
    membershipSingle,
    sessionSupabase,
    taskDraftsEq,
    taskDraftsOrder,
    taskDraftsOr,
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminSupabase)),
  createClient: vi.fn(() => Promise.resolve(mocks.sessionSupabase)),
}));

describe('task drafts route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('lists drafts with the admin client after membership passes', async () => {
    mocks.sessionSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    mocks.membershipSingle.mockResolvedValue({
      data: { type: 'MEMBER' as const },
      error: null,
    });
    mocks.taskDraftsOrder.mockResolvedValue({
      data: [{ id: 'draft-1', name: 'Draft' }],
      error: null,
    });

    const { GET } = await import(
      '@/app/api/v1/workspaces/[wsId]/task-drafts/route'
    );
    const response = await GET(
      new NextRequest('http://localhost/api/v1/workspaces/ws-1/task-drafts'),
      {
        params: Promise.resolve({ wsId: 'ws-1' }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [{ id: 'draft-1', name: 'Draft' }],
    });
    expect(mocks.adminSupabase.from).toHaveBeenCalledWith('task_drafts');
  });

  it('lists current-board and unassigned drafts for board mode', async () => {
    mocks.sessionSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    mocks.membershipSingle.mockResolvedValue({
      data: { type: 'MEMBER' as const },
      error: null,
    });
    mocks.taskDraftsOrder.mockResolvedValue({
      data: [
        { board_id: 'board-1', id: 'draft-1', name: 'Board draft' },
        { board_id: null, id: 'draft-2', name: 'Inbox draft' },
      ],
      error: null,
    });

    const { GET } = await import(
      '@/app/api/v1/workspaces/[wsId]/task-drafts/route'
    );
    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/task-drafts?boardId=board-1&includeUnassignedForBoard=true'
      ),
      {
        params: Promise.resolve({ wsId: 'ws-1' }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.taskDraftsOr).toHaveBeenCalledWith(
      'board_id.eq.board-1,board_id.is.null'
    );
    await expect(response.json()).resolves.toEqual({
      data: [
        { board_id: 'board-1', id: 'draft-1', name: 'Board draft' },
        { board_id: null, id: 'draft-2', name: 'Inbox draft' },
      ],
    });
  });
});
