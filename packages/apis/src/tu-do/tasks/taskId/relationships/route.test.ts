import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const WS_ID = '22222222-2222-4222-8222-222222222222';
const TASK_ID = '33333333-3333-4333-8333-333333333333';

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
  const memberClient = {};
  const adminClient = {
    from: vi.fn((table: string) => {
      if (table === 'tasks') {
        return taskQuery;
      }

      if (table === 'task_relationships') {
        const query = relationshipQueryQueue.shift();

        if (!query) {
          throw new Error('Unexpected task_relationships query');
        }

        return query;
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
    resolveAuthenticatedSessionUser: vi.fn(),
    sourceRelationshipsQuery,
    targetRelationshipsQuery,
    taskQuery,
    verifyWorkspaceMembershipType: vi.fn(),
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
});
