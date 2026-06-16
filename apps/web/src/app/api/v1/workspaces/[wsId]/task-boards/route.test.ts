import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authGetUserMock = vi.fn();
const workspaceMembersMaybeSingleMock = vi.fn();
const workspaceMembersEqMock = vi.fn();
const boardsQueryCalls: [string, unknown[]][] = [];
const boardsQueryResult = vi.fn();
const boardsInsertMock = vi.fn();
const boardsSelectMock = vi.fn();
const insertedBoardSelectMock = vi.fn();
const insertedBoardSingleMock = vi.fn();
const taskListsEqMock = vi.fn();
const taskListsInMock = vi.fn();
const taskListsSelectMock = vi.fn();
const tasksIsMock = vi.fn();
const tasksInMock = vi.fn();
const tasksSelectMock = vi.fn();
const fromMock = vi.fn();
const createClientMock = vi.fn();
const createAdminClientMock = vi.fn();
const getAppSessionTokenFromRequestMock = vi.fn();
const verifyAppSessionRequestMock = vi.fn();
const normalizeWorkspaceIdMock = vi.fn();
const getPermissionsMock = vi.fn();
const ensureDefaultPersonalTaskBoardMock = vi.fn();
const workspacesMaybeSingleMock = vi.fn();
const workspacesEqMock = vi.fn();
const workspacesSelectMock = vi.fn();
const checkRateLimitMock = vi.fn();
const checkUserSuspensionMock = vi.fn();
const enforceAdaptiveStepUpChallengeMock = vi.fn();
const getAdaptiveRateLimitConfigMock = vi.fn();
const hasAuthenticatedApiSessionMock = vi.fn();
const isBackendRateLimitErrorMock = vi.fn();
const isIPBlockedMock = vi.fn();
const recordApiAuthFailureMock = vi.fn();
const recordResponseAbuseSignalMock = vi.fn();
const resolveWebAbuseDecisionMock = vi.fn();
const validateAiTempAuthRequestMock = vi.fn();
const taskBoardShareResults: Array<{ data: unknown; error: unknown }> = [];

function createThenableQuery(result: { data: unknown; error: unknown }) {
  const query = {
    calls: [] as [string, unknown[]][],
    eq: vi.fn((...args: unknown[]) => {
      query.calls.push(['eq', args]);
      return query;
    }),
    ilike: vi.fn((...args: unknown[]) => {
      query.calls.push(['ilike', args]);
      return query;
    }),
    in: vi.fn((...args: unknown[]) => {
      query.calls.push(['in', args]);
      return query;
    }),
    is: vi.fn((...args: unknown[]) => {
      query.calls.push(['is', args]);
      return query;
    }),
    not: vi.fn((...args: unknown[]) => {
      query.calls.push(['not', args]);
      return query;
    }),
    order: vi.fn((...args: unknown[]) => {
      query.calls.push(['order', args]);
      return query;
    }),
    range: vi.fn((...args: unknown[]) => {
      query.calls.push(['range', args]);
      return query;
    }),
    select: vi.fn((...args: unknown[]) => {
      query.calls.push(['select', args]);
      return query;
    }),
  };
  Object.defineProperty(query, 'then', {
    value: (
      resolve: (value: { data: unknown; error: unknown }) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject),
  });

  return query;
}

vi.mock('@tuturuuu/auth/app-session', () => ({
  attachSupabaseAuthUser: (supabase: unknown) => supabase,
  createAppSessionUser: (claims: { email?: string | null; sub: string }) => ({
    aud: 'authenticated',
    email: claims.email ?? undefined,
    id: claims.sub,
  }),
  getAppSessionTokenFromRequest: (
    ...args: Parameters<typeof getAppSessionTokenFromRequestMock>
  ) => getAppSessionTokenFromRequestMock(...args),
  verifyAppSessionRequest: (
    ...args: Parameters<typeof verifyAppSessionRequestMock>
  ) => verifyAppSessionRequestMock(...args),
}));

vi.mock('@tuturuuu/auth/cli-session', () => ({
  CLI_APP_TARGET_APP: 'platform',
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: (...args: Parameters<typeof createClientMock>) =>
    createClientMock(...args),
  createAdminClient: (...args: Parameters<typeof createAdminClientMock>) =>
    createAdminClientMock(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tuturuuu/utils/workspace-helper')>();
  return {
    ...actual,
    getPermissions: (...args: Parameters<typeof getPermissionsMock>) =>
      getPermissionsMock(...args),
    normalizeWorkspaceId: (
      ...args: Parameters<typeof normalizeWorkspaceIdMock>
    ) => normalizeWorkspaceIdMock(...args),
  };
});

vi.mock('@/lib/tasks/default-personal-task-board', () => ({
  ensureDefaultPersonalTaskBoard: (
    ...args: Parameters<typeof ensureDefaultPersonalTaskBoardMock>
  ) => ensureDefaultPersonalTaskBoardMock(...args),
}));

vi.mock('@tuturuuu/utils/abuse-protection', () => ({
  extractIPFromHeaders: () => '127.0.0.1',
  isIPBlocked: (...args: Parameters<typeof isIPBlockedMock>) =>
    isIPBlockedMock(...args),
  recordApiAuthFailure: (
    ...args: Parameters<typeof recordApiAuthFailureMock>
  ) => recordApiAuthFailureMock(...args),
}));

vi.mock('@tuturuuu/utils/abuse-protection/backend-rate-limit', () => ({
  cascadeBackendRateLimitToProxyBan: vi.fn(),
  isBackendRateLimitError: (
    ...args: Parameters<typeof isBackendRateLimitErrorMock>
  ) => isBackendRateLimitErrorMock(...args),
}));

vi.mock('@tuturuuu/utils/abuse-protection/user-suspension', () => ({
  checkUserSuspension: (...args: Parameters<typeof checkUserSuspensionMock>) =>
    checkUserSuspensionMock(...args),
}));

vi.mock('@tuturuuu/utils/ai-temp-auth', () => ({
  validateAiTempAuthRequest: (
    ...args: Parameters<typeof validateAiTempAuthRequestMock>
  ) => validateAiTempAuthRequestMock(...args),
}));

vi.mock('@tuturuuu/utils/api-proxy-guard', () => ({
  hasAuthenticatedApiSession: (
    ...args: Parameters<typeof hasAuthenticatedApiSessionMock>
  ) => hasAuthenticatedApiSessionMock(...args),
}));

vi.mock('@/lib/abuse-risk', () => ({
  enforceAdaptiveStepUpChallenge: (
    ...args: Parameters<typeof enforceAdaptiveStepUpChallengeMock>
  ) => enforceAdaptiveStepUpChallengeMock(...args),
  getAdaptiveRateLimitConfig: (
    ...args: Parameters<typeof getAdaptiveRateLimitConfigMock>
  ) => getAdaptiveRateLimitConfigMock(...args),
  recordResponseAbuseSignal: (
    ...args: Parameters<typeof recordResponseAbuseSignalMock>
  ) => recordResponseAbuseSignalMock(...args),
  resolveWebAbuseDecision: (
    ...args: Parameters<typeof resolveWebAbuseDecisionMock>
  ) => resolveWebAbuseDecisionMock(...args),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (...args: Parameters<typeof checkRateLimitMock>) =>
    checkRateLimitMock(...args),
}));

import { GET, POST } from './route';

describe('task boards route GET', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    normalizeWorkspaceIdMock.mockResolvedValue(
      '00000000-0000-4000-8000-000000000123'
    );
    getPermissionsMock.mockResolvedValue({
      containsPermission: vi.fn(
        (permission: string) => permission === 'manage_projects'
      ),
    });
    ensureDefaultPersonalTaskBoardMock.mockResolvedValue(null);
    getAppSessionTokenFromRequestMock.mockReturnValue(null);
    verifyAppSessionRequestMock.mockReturnValue({ ok: false });
    checkRateLimitMock.mockResolvedValue({ allowed: true, headers: {} });
    checkUserSuspensionMock.mockResolvedValue({ suspended: false });
    enforceAdaptiveStepUpChallengeMock.mockResolvedValue(null);
    getAdaptiveRateLimitConfigMock.mockImplementation((config) => ({ config }));
    hasAuthenticatedApiSessionMock.mockReturnValue(false);
    isBackendRateLimitErrorMock.mockReturnValue(false);
    isIPBlockedMock.mockResolvedValue(null);
    resolveWebAbuseDecisionMock.mockResolvedValue({ action: 'allow' });
    validateAiTempAuthRequestMock.mockResolvedValue({ status: 'missing' });
    taskBoardShareResults.length = 0;
    boardsQueryCalls.length = 0;

    authGetUserMock.mockResolvedValue({
      data: {
        user: {
          email: 'member@example.com',
          id: '00000000-0000-4000-8000-000000000999',
        },
      },
      error: null,
    });

    workspaceMembersEqMock
      .mockReturnValueOnce({ eq: workspaceMembersEqMock })
      .mockReturnValueOnce({ maybeSingle: workspaceMembersMaybeSingleMock });
    workspaceMembersMaybeSingleMock.mockResolvedValue({
      data: { type: 'MEMBER' as const },
      error: null,
    });
    const workspacesQuery = {
      eq: workspacesEqMock,
      maybeSingle: workspacesMaybeSingleMock,
    };
    workspacesEqMock.mockReturnValue(workspacesQuery);
    workspacesMaybeSingleMock.mockResolvedValue({
      data: { id: '00000000-0000-4000-8000-000000000123' },
      error: null,
    });
    workspacesSelectMock.mockReturnValue(workspacesQuery);

    boardsQueryResult.mockReturnValue({
      data: [],
      error: null,
      count: 0,
    });
    boardsSelectMock.mockReturnValue({
      ...createThenableQuery(boardsQueryResult()),
      calls: boardsQueryCalls,
    });
    boardsInsertMock.mockReturnValue({
      select: insertedBoardSelectMock,
    });
    insertedBoardSelectMock.mockReturnValue({
      single: insertedBoardSingleMock,
    });
    insertedBoardSingleMock.mockResolvedValue({
      data: {
        id: '00000000-0000-4000-8000-000000000456',
        name: 'Roadmap',
        ws_id: '00000000-0000-4000-8000-000000000123',
      },
      error: null,
    });

    taskListsEqMock.mockResolvedValue({
      data: [],
      error: null,
    });
    taskListsInMock.mockReturnValue({
      eq: taskListsEqMock,
    });
    taskListsSelectMock.mockReturnValue({
      in: taskListsInMock,
    });

    tasksIsMock.mockResolvedValue({
      data: [],
      error: null,
    });
    tasksInMock.mockReturnValue({
      is: tasksIsMock,
    });
    tasksSelectMock.mockReturnValue({
      in: tasksInMock,
    });

    fromMock.mockImplementation((table: string) => {
      if (table === 'workspace_members') {
        return {
          select: vi.fn().mockReturnValue({
            eq: workspaceMembersEqMock,
          }),
        };
      }

      if (table === 'workspace_boards') {
        return {
          insert: boardsInsertMock,
          select: (...args: unknown[]) => {
            const query = createThenableQuery(boardsQueryResult());
            boardsQueryCalls.push(['select', args]);
            query.calls = boardsQueryCalls;
            return query;
          },
        };
      }

      if (table === 'workspaces') {
        return {
          select: workspacesSelectMock,
        };
      }

      if (table === 'task_lists') {
        return {
          select: taskListsSelectMock,
        };
      }

      if (table === 'tasks') {
        return {
          select: tasksSelectMock,
        };
      }

      if (table === 'task_board_shares') {
        return createThenableQuery(
          taskBoardShareResults.shift() ?? { data: [], error: null }
        );
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    createClientMock.mockResolvedValue({
      auth: {
        getUser: authGetUserMock,
      },
      from: fromMock,
    });

    createAdminClientMock.mockResolvedValue({
      from: fromMock,
    });
  });

  it('rejects board listing for workspace members without manage_projects', async () => {
    const containsPermission = vi.fn().mockReturnValue(false);
    getPermissionsMock.mockResolvedValueOnce({ containsPermission });

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/personal/task-boards?status=all'
      ),
      {
        params: Promise.resolve({
          wsId: 'personal',
        }),
      }
    );

    if (!response) {
      throw new Error('Expected GET to return a response');
    }

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "You don't have permission to view task boards",
    });
    expect(getPermissionsMock).toHaveBeenCalledWith({
      user: expect.objectContaining({
        id: '00000000-0000-4000-8000-000000000999',
      }),
      wsId: '00000000-0000-4000-8000-000000000123',
    });
    expect(containsPermission).toHaveBeenCalledWith('manage_projects');
    expect(createAdminClientMock).not.toHaveBeenCalled();
    expect(ensureDefaultPersonalTaskBoardMock).not.toHaveBeenCalled();
    expect(boardsQueryCalls).toEqual([]);
  });

  it('lists member boards without creating a default board on GET', async () => {
    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/personal/task-boards?status=all'
      ),
      {
        params: Promise.resolve({
          wsId: 'personal',
        }),
      }
    );

    if (!response) {
      throw new Error('Expected GET to return a response');
    }

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ boards: [], count: 0 });
    expect(ensureDefaultPersonalTaskBoardMock).not.toHaveBeenCalled();
    expect(boardsInsertMock).not.toHaveBeenCalled();
    expect(boardsQueryCalls).toContainEqual([
      'select',
      ['*', { count: 'exact' }],
    ]);
  });

  it('lists only directly shared boards for workspace guests', async () => {
    workspaceMembersMaybeSingleMock.mockResolvedValueOnce({
      data: null,
      error: null,
    });
    authGetUserMock.mockResolvedValueOnce({
      data: {
        user: {
          email: 'guest@example.com',
          id: '00000000-0000-4000-8000-000000000999',
        },
      },
      error: null,
    });
    const sharedBoard = {
      id: '00000000-0000-4000-8000-000000000456',
      name: 'Shared roadmap',
      ws_id: '00000000-0000-4000-8000-000000000123',
    };
    taskBoardShareResults.push(
      {
        data: [
          {
            id: '00000000-0000-4000-8000-000000000777',
            board_id: sharedBoard.id,
            permission: 'view',
            shared_with_user_id: '00000000-0000-4000-8000-000000000999',
            workspace_boards: sharedBoard,
          },
        ],
        error: null,
      },
      { data: [], error: null }
    );
    boardsQueryResult.mockReturnValueOnce({
      count: 1,
      data: [sharedBoard],
      error: null,
    });

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/personal/task-boards?status=active'
      ),
      {
        params: Promise.resolve({
          wsId: 'personal',
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      access_type: 'guest',
      boards: [
        {
          ...sharedBoard,
          access_type: 'guest',
          guest_permission: 'view',
          list_count: 0,
          task_count: 0,
        },
      ],
      count: 1,
      guest_highest_permission: 'view',
    });
    expect(ensureDefaultPersonalTaskBoardMock).not.toHaveBeenCalled();
    expect(boardsQueryCalls).toContainEqual(['in', ['id', [sharedBoard.id]]]);
  });

  it('allows CLI app-session tokens to list personal workspace boards', async () => {
    getAppSessionTokenFromRequestMock.mockReturnValue('ttr_app_access');
    verifyAppSessionRequestMock.mockReturnValue({
      claims: {
        email: 'agent@example.com',
        sub: '00000000-0000-4000-8000-000000000999',
      },
      ok: true,
    });

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/personal/task-boards?status=all',
        {
          headers: {
            Authorization: 'Bearer ttr_app_access',
          },
        }
      ),
      {
        params: Promise.resolve({
          wsId: 'personal',
        }),
      }
    );

    if (!response) {
      throw new Error('Expected GET to return a response');
    }

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ boards: [], count: 0 });
    expect(ensureDefaultPersonalTaskBoardMock).not.toHaveBeenCalled();
    expect(boardsInsertMock).not.toHaveBeenCalled();
    expect(createClientMock).not.toHaveBeenCalled();
    expect(normalizeWorkspaceIdMock).toHaveBeenCalledWith(
      'personal',
      expect.objectContaining({ from: fromMock })
    );
    expect(verifyAppSessionRequestMock).toHaveBeenCalledWith(
      expect.any(NextRequest),
      { targetApp: ['platform', 'calendar', 'tasks'] }
    );
  });

  it('allows Tasks app-session tokens to list personal workspace boards', async () => {
    getAppSessionTokenFromRequestMock.mockReturnValue('ttr_app_tasks');
    verifyAppSessionRequestMock.mockReturnValue({
      claims: {
        email: 'tasks-user@example.com',
        sub: '00000000-0000-4000-8000-000000000999',
      },
      ok: true,
    });

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/personal/task-boards?status=all',
        {
          headers: {
            cookie: 'tuturuuu_app_session=ttr_app_tasks',
          },
        }
      ),
      {
        params: Promise.resolve({
          wsId: 'personal',
        }),
      }
    );

    if (!response) {
      throw new Error('Expected GET to return a response');
    }

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ boards: [], count: 0 });
    expect(ensureDefaultPersonalTaskBoardMock).not.toHaveBeenCalled();
    expect(boardsInsertMock).not.toHaveBeenCalled();
    expect(createClientMock).not.toHaveBeenCalled();
    expect(verifyAppSessionRequestMock).toHaveBeenCalledWith(
      expect.any(NextRequest),
      { targetApp: ['platform', 'calendar', 'tasks'] }
    );
  });

  it('rejects suspended CLI app-session callers before listing boards', async () => {
    getAppSessionTokenFromRequestMock.mockReturnValue('ttr_app_access');
    verifyAppSessionRequestMock.mockReturnValue({
      claims: {
        email: 'agent@example.com',
        sub: '00000000-0000-4000-8000-000000000999',
      },
      ok: true,
    });
    checkUserSuspensionMock.mockResolvedValue({
      reason: 'Suspended account',
      suspended: true,
    });

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/personal/task-boards?status=all',
        {
          headers: {
            Authorization: 'Bearer ttr_app_access',
          },
        }
      ),
      {
        params: Promise.resolve({
          wsId: 'personal',
        }),
      }
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Forbidden',
      message: 'Suspended account',
    });
    expect(normalizeWorkspaceIdMock).not.toHaveBeenCalled();
    expect(boardsSelectMock).not.toHaveBeenCalled();
  });

  it('returns a stable duplicate-name error when creating an existing board name', async () => {
    getPermissionsMock.mockResolvedValue({
      containsPermission: vi.fn().mockReturnValue(true),
    });
    insertedBoardSingleMock.mockResolvedValueOnce({
      data: null,
      error: {
        code: '23505',
        message:
          'duplicate key value violates unique constraint "idx_workspace_boards_unique_active_name"',
      },
    });

    const response = await POST(
      new NextRequest(
        'http://localhost/api/v1/workspaces/personal/task-boards',
        {
          method: 'POST',
          body: JSON.stringify({
            name: ' Roadmap ',
          }),
          headers: {
            'Content-Type': 'application/json',
          },
        }
      ),
      {
        params: Promise.resolve({
          wsId: 'personal',
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
