import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const WS_ID = '22222222-2222-4222-8222-222222222222';
const TASK_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_TASK_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_WS_ID = '55555555-5555-4555-8555-555555555555';

const mocks = vi.hoisted(() => {
  const relationshipQueryQueue: unknown[] = [];
  const sourceRelationshipsQuery = {
    eq: vi.fn(),
    select: vi.fn(() => sourceRelationshipsQuery),
  };
  const targetRelationshipsQuery = {
    eq: vi.fn(),
    select: vi.fn(() => targetRelationshipsQuery),
  };
  const taskQuery = {
    eq: vi.fn(() => taskQuery),
    is: vi.fn(() => taskQuery),
    maybeSingle: vi.fn(),
    select: vi.fn(() => taskQuery),
  };
  let mutationResult: unknown = {
    count: 1,
    data: {
      id: '66666666-6666-4666-8666-666666666666',
      source_task_id: '33333333-3333-4333-8333-333333333333',
      target_task_id: '44444444-4444-4444-8444-444444444444',
      type: 'blocks',
    },
    error: null,
  };
  const relationshipMutationQuery = {
    delete: vi.fn(() => relationshipMutationQuery),
    eq: vi.fn(() => relationshipMutationQuery),
    insert: vi.fn(() => relationshipMutationQuery),
    maybeSingle: vi.fn(() => Promise.resolve(mutationResult)),
    select: vi.fn(() => relationshipMutationQuery),
  };
  Object.defineProperty(relationshipMutationQuery, 'then', {
    value: (resolve: (result: unknown) => unknown) =>
      Promise.resolve(mutationResult).then(resolve),
  });
  const memberClient = {};
  const adminClient = {
    from: vi.fn((table: string) => {
      if (table === 'tasks') {
        return taskQuery;
      }

      if (table === 'task_relationships') {
        const query = relationshipQueryQueue.shift();
        return query ?? relationshipMutationQuery;
      }

      throw new Error(`Unexpected admin table: ${table}`);
    }),
  };

  return {
    adminClient,
    createClient: vi.fn(),
    memberClient,
    normalizeWorkspaceId: vi.fn(),
    relationshipQueryQueue,
    relationshipMutationQuery,
    resolveTaskBoardAccess: vi.fn(),
    resolveAuthenticatedSessionUser: vi.fn(),
    sourceRelationshipsQuery,
    targetRelationshipsQuery,
    taskQuery,
    verifyWorkspaceMembershipType: vi.fn(),
    setMutationResult: (result: unknown) => {
      mutationResult = result;
    },
  };
});

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.resolveAuthenticatedSessionUser,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => mocks.adminClient),
  createClient: mocks.createClient,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: mocks.normalizeWorkspaceId,
  verifyWorkspaceMembershipType: mocks.verifyWorkspaceMembershipType,
}));

vi.mock('../../../board-access', () => ({
  resolveTaskBoardAccess: mocks.resolveTaskBoardAccess,
}));

describe('task relationship route handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.relationshipQueryQueue.length = 0;
    mocks.relationshipQueryQueue.push(
      mocks.sourceRelationshipsQuery,
      mocks.targetRelationshipsQuery
    );
    mocks.createClient.mockResolvedValue(mocks.memberClient);
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      authError: null,
      user: { id: USER_ID },
    });
    mocks.normalizeWorkspaceId.mockResolvedValue(WS_ID);
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
    mocks.resolveTaskBoardAccess.mockImplementation(
      async ({ taskId }: { taskId: string }) => ({
        access: { mode: 'member', permission: 'edit' },
        board: { id: `board-${taskId}`, ws_id: WS_ID },
        boardId: `board-${taskId}`,
        sbAdmin: mocks.adminClient,
        supabase: mocks.memberClient,
        taskId,
        user: { id: USER_ID },
        wsId: WS_ID,
      })
    );
    mocks.setMutationResult({
      count: 1,
      data: {
        id: '66666666-6666-4666-8666-666666666666',
        source_task_id: TASK_ID,
        target_task_id: OTHER_TASK_ID,
        type: 'blocks',
      },
      error: null,
    });
    mocks.taskQuery.maybeSingle.mockResolvedValue({
      data: {
        id: TASK_ID,
        list: { board: { ws_id: WS_ID } },
      },
      error: null,
    });
    mocks.sourceRelationshipsQuery.eq.mockResolvedValue({
      data: [],
      error: null,
    });
    mocks.targetRelationshipsQuery.eq.mockResolvedValue({
      data: [],
      error: null,
    });
  });

  it('loads relationships with an injected app-session auth context', async () => {
    const { handleTaskRelationshipRouteGET } = await import('./route.js');
    const response = await handleTaskRelationshipRouteGET(
      new NextRequest(
        `http://localhost/api/v1/workspaces/${WS_ID}/tasks/${TASK_ID}/relationships`
      ),
      { params: Promise.resolve({ taskId: TASK_ID, wsId: WS_ID }) },
      {
        appSession: true,
        supabase: mocks.memberClient as never,
        user: { id: USER_ID } as never,
      }
    );

    await expect(response.json()).resolves.toEqual({
      blockedBy: [],
      blocking: [],
      childTasks: [],
      parentTask: null,
      relatedTasks: [],
    });
    expect(response.status).toBe(200);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.resolveAuthenticatedSessionUser).not.toHaveBeenCalled();
    expect(mocks.verifyWorkspaceMembershipType).toHaveBeenCalledWith({
      supabase: mocks.memberClient,
      userId: USER_ID,
      wsId: WS_ID,
    });
  });

  async function runMutation(method: 'DELETE' | 'POST') {
    mocks.relationshipQueryQueue.length = 0;
    const route = await import('./route.js');
    const handler =
      method === 'POST'
        ? route.handleTaskRelationshipRoutePOST
        : route.handleTaskRelationshipRouteDELETE;
    return handler(
      new NextRequest(
        `http://localhost/api/v1/workspaces/${WS_ID}/tasks/${TASK_ID}/relationships`,
        {
          body: JSON.stringify({
            source_task_id: TASK_ID,
            target_task_id: OTHER_TASK_ID,
            type: 'blocks',
          }),
          method,
        }
      ),
      { params: Promise.resolve({ taskId: TASK_ID, wsId: WS_ID }) },
      {
        appSession: true,
        supabase: mocks.memberClient as never,
        user: { id: USER_ID } as never,
      }
    );
  }

  it.each(['POST', 'DELETE'] as const)(
    '%s requires edit access to both relationship task boards',
    async (method) => {
      mocks.resolveTaskBoardAccess
        .mockResolvedValueOnce({
          access: { mode: 'member', permission: 'edit' },
          wsId: WS_ID,
        })
        .mockResolvedValueOnce({
          error: NextResponse.json(
            { error: 'Workspace access denied' },
            { status: 403 }
          ),
        });

      const response = await runMutation(method);

      expect(response.status).toBe(403);
      expect(mocks.resolveTaskBoardAccess).toHaveBeenCalledTimes(2);
      expect(mocks.resolveTaskBoardAccess).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          requiredPermission: 'edit',
          taskId: TASK_ID,
        })
      );
      expect(mocks.resolveTaskBoardAccess).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          requiredPermission: 'edit',
          taskId: OTHER_TASK_ID,
        })
      );
      expect(mocks.relationshipMutationQuery.insert).not.toHaveBeenCalled();
      expect(mocks.relationshipMutationQuery.delete).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['manage_projects member', 'member'],
    ['explicit edit-share guest', 'guest'],
  ] as const)(
    'allows a %s to create a cross-board relationship',
    async (_, mode) => {
      mocks.resolveTaskBoardAccess.mockImplementation(
        async ({ taskId }: { taskId: string }) => ({
          access: { mode, permission: 'edit' },
          boardId: taskId === TASK_ID ? 'source-board' : 'target-board',
          wsId: WS_ID,
        })
      );

      const response = await runMutation('POST');

      expect(response.status).toBe(200);
      expect(mocks.relationshipMutationQuery.insert).toHaveBeenCalledTimes(1);
    }
  );

  it('rejects a view-only guest before creating a relationship', async () => {
    mocks.resolveTaskBoardAccess.mockResolvedValue({
      error: NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      ),
    });

    const response = await runMutation('POST');

    expect(response.status).toBe(403);
    expect(mocks.relationshipMutationQuery.insert).not.toHaveBeenCalled();
  });

  it.each([
    'an ordinary member without manage_projects',
    'a nonmember without a board share',
  ])('rejects %s before creating a relationship', async () => {
    mocks.resolveTaskBoardAccess.mockResolvedValue({
      error: NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      ),
    });

    const response = await runMutation('POST');

    expect(response.status).toBe(403);
    expect(mocks.resolveTaskBoardAccess).toHaveBeenCalledTimes(1);
    expect(mocks.relationshipMutationQuery.insert).not.toHaveBeenCalled();
  });

  it('fails closed when the second task belongs to another workspace', async () => {
    mocks.resolveTaskBoardAccess
      .mockResolvedValueOnce({
        access: { mode: 'member', permission: 'edit' },
        wsId: WS_ID,
      })
      .mockResolvedValueOnce({
        access: { mode: 'member', permission: 'edit' },
        wsId: OTHER_WS_ID,
      });

    const response = await runMutation('POST');

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: 'Related task not found',
    });
    expect(mocks.relationshipMutationQuery.insert).not.toHaveBeenCalled();
  });

  it('propagates board-access lookup failures before mutation', async () => {
    mocks.resolveTaskBoardAccess.mockResolvedValue({
      error: NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      ),
    });

    const response = await runMutation('DELETE');

    expect(response.status).toBe(500);
    expect(mocks.relationshipMutationQuery.delete).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated mutation before board access', async () => {
    mocks.relationshipQueryQueue.length = 0;
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      authError: new Error('missing session'),
      user: null,
    });
    const { handleTaskRelationshipRoutePOST } = await import('./route.js');

    const response = await handleTaskRelationshipRoutePOST(
      new NextRequest(
        `http://localhost/api/v1/workspaces/${WS_ID}/tasks/${TASK_ID}/relationships`,
        {
          body: JSON.stringify({
            source_task_id: TASK_ID,
            target_task_id: OTHER_TASK_ID,
            type: 'blocks',
          }),
          method: 'POST',
        }
      ),
      { params: Promise.resolve({ taskId: TASK_ID, wsId: WS_ID }) }
    );

    expect(response.status).toBe(401);
    expect(mocks.resolveTaskBoardAccess).not.toHaveBeenCalled();
  });
});
