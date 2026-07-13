import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSatelliteAppSessionUser: vi.fn(),
  getTranslations: vi.fn(),
  getUserWorkspaceConfig: vi.fn(),
  getWorkspace: vi.fn(),
  headers: vi.fn(),
  createWorkspaceTaskBoard: vi.fn(),
  listWorkspaceBoards: vi.fn(),
  listWorkspaceTaskLists: vi.fn(),
  myTasksPage: vi.fn(),
  connection: vi.fn(),
  redirect: vi.fn(),
  taskBoardLoadingState: vi.fn(),
  taskBoardServerPage: vi.fn(),
  toWorkspaceSlug: vi.fn(),
  updateWorkspaceTaskList: vi.fn(),
  withForwardedInternalApiAuth: vi.fn(),
  workspaceProjectsPage: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api', () => ({
  createWorkspaceTaskBoard: (
    ...args: Parameters<typeof mocks.createWorkspaceTaskBoard>
  ) => mocks.createWorkspaceTaskBoard(...args),
  getUserWorkspaceConfig: (
    ...args: Parameters<typeof mocks.getUserWorkspaceConfig>
  ) => mocks.getUserWorkspaceConfig(...args),
  listWorkspaceBoards: (
    ...args: Parameters<typeof mocks.listWorkspaceBoards>
  ) => mocks.listWorkspaceBoards(...args),
  listWorkspaceTaskLists: (
    ...args: Parameters<typeof mocks.listWorkspaceTaskLists>
  ) => mocks.listWorkspaceTaskLists(...args),
  TASK_DEFAULT_BOARD_ID_CONFIG_ID: 'TASK_DEFAULT_BOARD_ID',
  updateWorkspaceTaskList: (
    ...args: Parameters<typeof mocks.updateWorkspaceTaskList>
  ) => mocks.updateWorkspaceTaskList(...args),
  withForwardedInternalApiAuth: (
    ...args: Parameters<typeof mocks.withForwardedInternalApiAuth>
  ) => mocks.withForwardedInternalApiAuth(...args),
}));

vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: (
    ...args: Parameters<typeof mocks.getSatelliteAppSessionUser>
  ) => mocks.getSatelliteAppSessionUser(...args),
}));

vi.mock('@tuturuuu/ui/tu-do/my-tasks/my-tasks-page', () => ({
  default: mocks.myTasksPage,
}));

vi.mock('@tuturuuu/ui/tu-do/boards/boardId/task-board-server-page', () => ({
  default: mocks.taskBoardServerPage,
}));

vi.mock('@tuturuuu/ui/tu-do/shared/task-board-loading-state', () => ({
  TaskBoardLoadingState: mocks.taskBoardLoadingState,
}));

vi.mock('@tuturuuu/ui/tu-do/boards/workspace-projects-page', () => ({
  default: mocks.workspaceProjectsPage,
}));

vi.mock('@tuturuuu/utils/constants', () => ({
  toWorkspaceSlug: (...args: Parameters<typeof mocks.toWorkspaceSlug>) =>
    mocks.toWorkspaceSlug(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getWorkspace: (...args: Parameters<typeof mocks.getWorkspace>) =>
    mocks.getWorkspace(...args),
}));

vi.mock('next/headers', () => ({
  headers: (...args: Parameters<typeof mocks.headers>) =>
    mocks.headers(...args),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: (...args: Parameters<typeof mocks.getTranslations>) =>
    mocks.getTranslations(...args),
}));

vi.mock('next/navigation', () => ({
  redirect: (...args: Parameters<typeof mocks.redirect>) =>
    mocks.redirect(...args),
}));

vi.mock('next/server', () => ({
  connection: (...args: Parameters<typeof mocks.connection>) =>
    mocks.connection(...args),
}));

describe('tasks app task pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSatelliteAppSessionUser.mockResolvedValue({ id: 'user-1' });
    mocks.getTranslations.mockResolvedValue((key: string) => key);
    mocks.getUserWorkspaceConfig.mockResolvedValue({ value: 'board-default' });
    mocks.getWorkspace.mockResolvedValue({
      id: 'workspace-1',
      joined: true,
      personal: false,
    });
    mocks.headers.mockResolvedValue(new Headers({ cookie: 'session=1' }));
    mocks.createWorkspaceTaskBoard.mockResolvedValue({
      board: {
        id: 'board-created',
        name: 'Created',
      },
    });
    mocks.listWorkspaceBoards.mockResolvedValue({
      boards: [
        {
          archived_at: null,
          deleted_at: null,
          id: 'board-first',
          name: 'First',
        },
        {
          archived_at: null,
          deleted_at: null,
          id: 'board-default',
          name: 'Default',
        },
      ],
    });
    mocks.listWorkspaceTaskLists.mockResolvedValue({
      lists: [
        { id: 'list-todo', name: 'To Do' },
        { id: 'list-progress', name: 'In Progress' },
        { id: 'list-done', name: 'Done' },
        { id: 'list-closed', name: 'Closed' },
      ],
    });
    mocks.redirect.mockImplementation((href: string) => {
      const error = new Error('NEXT_REDIRECT') as Error & { href: string };
      error.href = href;
      throw error;
    });
    mocks.toWorkspaceSlug.mockImplementation(
      (workspaceId: string, options?: { personal?: boolean }) =>
        options?.personal ? 'personal' : workspaceId
    );
    mocks.withForwardedInternalApiAuth.mockReturnValue({ auth: 'forwarded' });
    mocks.updateWorkspaceTaskList.mockResolvedValue({ list: null });
    mocks.connection.mockResolvedValue(undefined);
  });

  it('redirects /tasks to the configured default board', async () => {
    const { default: Page } = await import(
      '@/app/[locale]/(dashboard)/[wsId]/tasks/page'
    );

    await expect(
      Page({ params: Promise.resolve({ wsId: 'workspace-1' }) })
    ).rejects.toMatchObject({
      href: '/workspace-1/boards/board-default',
    });
    expect(mocks.connection).toHaveBeenCalledTimes(1);
    expect(mocks.getUserWorkspaceConfig).toHaveBeenCalledWith(
      'workspace-1',
      'TASK_DEFAULT_BOARD_ID',
      { auth: 'forwarded' }
    );
  });

  it('falls back to the first accessible board when the configured board is missing', async () => {
    mocks.getUserWorkspaceConfig.mockResolvedValue({ value: 'missing-board' });

    const { default: Page } = await import(
      '@/app/[locale]/(dashboard)/[wsId]/tasks/page'
    );

    await expect(
      Page({ params: Promise.resolve({ wsId: 'workspace-1' }) })
    ).rejects.toMatchObject({
      href: '/workspace-1/boards/board-first',
    });
  });

  it('creates a board with translated default list names when no board exists', async () => {
    mocks.listWorkspaceBoards.mockResolvedValue({ boards: [] });

    const { default: Page } = await import(
      '@/app/[locale]/(dashboard)/[wsId]/tasks/page'
    );

    await expect(
      Page({ params: Promise.resolve({ wsId: 'workspace-1' }) })
    ).rejects.toMatchObject({
      href: '/workspace-1/boards/board-created',
    });
    expect(mocks.createWorkspaceTaskBoard).toHaveBeenCalledWith(
      'workspace-1',
      { name: 'ws-tasks.default_board_name' },
      { auth: 'forwarded' }
    );
    expect(mocks.updateWorkspaceTaskList).toHaveBeenCalledWith(
      'workspace-1',
      'board-created',
      'list-todo',
      { name: 'ws-tasks.default_list_todo' },
      { auth: 'forwarded' }
    );
    expect(mocks.updateWorkspaceTaskList).toHaveBeenCalledWith(
      'workspace-1',
      'board-created',
      'list-closed',
      { name: 'ws-tasks.default_list_closed' },
      { auth: 'forwarded' }
    );
  });

  it('refetches boards after an auto-create race and redirects to the winner', async () => {
    mocks.listWorkspaceBoards
      .mockResolvedValueOnce({ boards: [] })
      .mockResolvedValueOnce({
        boards: [
          {
            archived_at: null,
            deleted_at: null,
            id: 'board-race-winner',
            name: 'Race winner',
          },
        ],
      });
    mocks.createWorkspaceTaskBoard.mockRejectedValue(new Error('conflict'));

    const { default: Page } = await import(
      '@/app/[locale]/(dashboard)/[wsId]/tasks/page'
    );

    await expect(
      Page({ params: Promise.resolve({ wsId: 'workspace-1' }) })
    ).rejects.toMatchObject({
      href: '/workspace-1/boards/board-race-winner',
    });
  });

  it('forces the board detail route to open kanban by default', async () => {
    const { default: Page } = await import(
      '@/app/[locale]/(dashboard)/[wsId]/boards/[boardId]/page'
    );

    const params = Promise.resolve({ boardId: 'board-1', wsId: 'workspace-1' });
    const result = await Page({ params });

    expect(result).toMatchObject({
      props: {
        defaultView: 'kanban',
        params,
        routePrefix: '',
        rootLoading: true,
      },
      type: mocks.taskBoardServerPage,
    });
  });

  it('uses the shared full-bleed board loading state for board route loading', async () => {
    const { default: Loading } = await import(
      '@/app/[locale]/(dashboard)/[wsId]/boards/[boardId]/loading'
    );

    const result = Loading();

    expect(result).toMatchObject({
      props: {
        root: true,
        showHeader: true,
      },
      type: mocks.taskBoardLoadingState,
    });
  });

  it('redirects /boards through the same task board entrypoint', async () => {
    const { default: Page } = await import(
      '@/app/[locale]/(dashboard)/[wsId]/boards/page'
    );

    await expect(
      Page({ params: Promise.resolve({ wsId: 'workspace-1' }) })
    ).rejects.toMatchObject({
      href: '/workspace-1/boards/board-default',
    });

    expect(mocks.connection).toHaveBeenCalledTimes(1);
  });

  it('uses the shared full-bleed board loading state for entrypoint loading routes', async () => {
    const [{ default: TasksLoading }, { default: BoardsLoading }] =
      await Promise.all([
        import('@/app/[locale]/(dashboard)/[wsId]/tasks/loading'),
        import('@/app/[locale]/(dashboard)/[wsId]/boards/loading'),
      ]);

    const taskResult = TasksLoading();
    const boardResult = BoardsLoading();

    for (const result of [taskResult, boardResult]) {
      expect(result).toMatchObject({
        props: {
          root: true,
          showHeader: true,
        },
        type: mocks.taskBoardLoadingState,
      });
    }
  });

  it('keeps task boards consolidated and exposes progress as a first-class destination', async () => {
    const { getNavigationLinks } = await import(
      '@/app/[locale]/(dashboard)/[wsId]/navigation'
    );

    const links = await getNavigationLinks({ personalOrWsId: 'workspace-1' });

    expect(links).toHaveLength(2);
    expect(links[0]).toMatchObject({
      href: '/workspace-1/tasks',
      aliases: [
        '/workspace-1/tasks/*',
        '/workspace-1/boards',
        '/workspace-1/boards/*',
      ],
    });
    expect(links[1]).toMatchObject({
      href: '/workspace-1/progress',
      aliases: ['/workspace-1/progress/*'],
    });
    expect(links[1]).not.toHaveProperty('children');
  });

  it('redirects unauthenticated entrypoint users to login', async () => {
    mocks.getSatelliteAppSessionUser.mockResolvedValue(null);

    const { default: Page } = await import(
      '@/app/[locale]/(dashboard)/[wsId]/tasks/page'
    );

    await expect(
      Page({ params: Promise.resolve({ wsId: 'workspace-1' }) })
    ).rejects.toMatchObject({
      href: '/login',
    });
  });

  it('redirects inaccessible workspaces before resolving boards', async () => {
    mocks.getWorkspace.mockResolvedValue(null);

    const { default: Page } = await import(
      '@/app/[locale]/(dashboard)/[wsId]/tasks/page'
    );

    await expect(
      Page({ params: Promise.resolve({ wsId: 'workspace-1' }) })
    ).rejects.toMatchObject({
      href: '/onboarding',
    });
    expect(mocks.listWorkspaceBoards).not.toHaveBeenCalled();
  });
});
