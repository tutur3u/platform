import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  getPendingWorkspaceInvitation: vi.fn(),
  getPermissions: vi.fn(),
  getRequestWorkspace: vi.fn(),
  getSatelliteAppSessionUser: vi.fn(),
  getSatelliteCurrentUser: vi.fn(),
  getWorkspace: vi.fn(),
  getWorkspaceTaskBoard: vi.fn(),
  headers: vi.fn(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('@tanstack/react-start/server-only', () => ({}));
vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: mocks.getSatelliteAppSessionUser,
  getSatelliteCurrentUser: mocks.getSatelliteCurrentUser,
}));
vi.mock('@tuturuuu/satellite/workspace-invitation', () => ({
  getPendingWorkspaceInvitation: mocks.getPendingWorkspaceInvitation,
}));
vi.mock('@tuturuuu/satellite/workspace-layout-helpers', () => ({
  getSidebarBehaviorUpdatedAt: () => null,
  getSidebarCollapsedState: () => false,
  parseSidebarBehavior: () => 'expanded',
}));
vi.mock('@tuturuuu/start-bridge/next/headers', () => ({
  cookies: mocks.cookies,
  headers: mocks.headers,
}));
vi.mock('@tuturuuu/start-bridge/next/navigation', () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
}));
vi.mock('@tuturuuu/utils/constants', () => ({
  toWorkspaceSlug: (id: string, { personal }: { personal: boolean }) =>
    personal ? 'personal' : id,
}));
vi.mock('@tuturuuu/utils/request-workspace', () => ({
  getRequestWorkspace: mocks.getRequestWorkspace,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
  getWorkspace: mocks.getWorkspace,
}));
vi.mock('@tuturuuu/internal-api', () => ({
  getWorkspaceTaskBoard: mocks.getWorkspaceTaskBoard,
  InternalApiError: class InternalApiError extends Error {
    status = 500;
  },
  withForwardedInternalApiAuth: () => ({}),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));
vi.mock(
  '@tuturuuu/tasks-ui/calendar/components/load-smart-scheduling-tasks',
  () => ({ loadSmartSchedulingTasks: vi.fn() })
);
vi.mock('@tuturuuu/tasks-ui/calendar/scheduling-task-transport', () => ({
  schedulingTaskTransport: {},
}));
vi.mock('@tuturuuu/tasks-ui/tu-do/cycles/task-cycles-page-model', () => ({
  loadTaskCycles: vi.fn(),
}));
vi.mock('@tuturuuu/utils/calendar-auth-token', () => ({
  fetchUserWorkspaceCalendarGoogleTokenForClient: vi.fn(),
}));
vi.mock('@tuturuuu/utils/co-member-names', () => ({
  resolveCoMemberNames: vi.fn(),
}));
vi.mock('@tuturuuu/utils/lettin-task-reference', () => ({
  getLettinNotebookReferenceUrl: vi.fn(),
}));
vi.mock('../lib/tasks/task-board-entrypoint', () => ({
  resolveTaskBoardEntrypoint: vi.fn(),
}));

const { workspaceModel } = await import('./workspace-model.server');
const { boardModel } = await import('./workspace-page-model.server');

const user = { id: 'user-1', email: 'member@example.com' };
const workspace = {
  id: 'ws-1',
  joined: true,
  personal: true,
  tier: null,
};

describe('workspaceModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSatelliteAppSessionUser.mockResolvedValue(user);
    mocks.getSatelliteCurrentUser.mockResolvedValue({ id: 'user-1' });
    mocks.getRequestWorkspace.mockResolvedValue(workspace);
    mocks.getPermissions.mockResolvedValue({
      containsPermission: () => true,
    });
    mocks.cookies.mockResolvedValue({ get: () => undefined });
    mocks.headers.mockResolvedValue(new Headers());
  });

  it('reads the profile while the workspace guard runs', async () => {
    let finishWorkspace: ((value: typeof workspace) => void) | undefined;
    mocks.getRequestWorkspace.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishWorkspace = resolve;
        })
    );

    const model = workspaceModel('personal');

    await vi.waitFor(() =>
      expect(mocks.getSatelliteCurrentUser).toHaveBeenCalledWith('tasks')
    );
    expect(mocks.getPermissions).not.toHaveBeenCalled();
    finishWorkspace?.(workspace);

    await expect(model).resolves.toMatchObject({
      kind: 'workspace',
      slug: 'personal',
      profile: { id: 'user-1' },
      canManageCycles: true,
    });
  });

  it('keeps the guard decision when the early profile read fails', async () => {
    mocks.getSatelliteCurrentUser.mockRejectedValueOnce(new Error('offline'));
    mocks.getRequestWorkspace.mockResolvedValueOnce(null);
    mocks.getPendingWorkspaceInvitation.mockResolvedValueOnce(null);
    mocks.notFound.mockImplementationOnce(() => {
      throw new Error('NOT_FOUND');
    });

    await expect(workspaceModel('missing')).rejects.toThrow('NOT_FOUND');
  });
});

describe('boardModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(new Headers());
    mocks.getWorkspaceTaskBoard.mockImplementation(
      async (wsId: string, boardId: string) => ({
        board: { id: boardId, ws_id: wsId, access_type: 'member' },
      })
    );
  });

  it('reuses the layout-verified workspace for a board in the same workspace', async () => {
    const scope = { workspace, user, slug: 'personal' } as Parameters<
      typeof boardModel
    >[0];

    await expect(boardModel(scope, 'board-1')).resolves.toMatchObject({
      kind: 'board',
      boardId: 'board-1',
      workspace,
    });
    expect(mocks.getWorkspace).not.toHaveBeenCalled();
  });

  it('reads the board workspace when the board belongs to another workspace', async () => {
    const otherWorkspace = { ...workspace, id: 'ws-2', personal: false };
    mocks.getWorkspaceTaskBoard.mockResolvedValueOnce({
      board: { id: 'board-2', ws_id: 'ws-2', access_type: 'member' },
    });
    mocks.getWorkspace.mockResolvedValueOnce(otherWorkspace);
    const scope = { workspace, user, slug: 'personal' } as Parameters<
      typeof boardModel
    >[0];

    await expect(boardModel(scope, 'board-2')).resolves.toMatchObject({
      workspace: otherWorkspace,
    });
    expect(mocks.getWorkspace).toHaveBeenCalledWith('ws-2', {
      useAdmin: true,
      user,
    });
  });
});
