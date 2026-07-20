import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSatelliteAppSessionUser: vi.fn(),
  getTranslations: vi.fn(),
  getUserWorkspaceConfig: vi.fn(),
  getWorkspace: vi.fn(),
  headers: vi.fn(),
  createWorkspaceTaskBoard: vi.fn(),
  listWorkspaceTaskBoards: vi.fn(),
  listWorkspaceTaskLists: vi.fn(),
  myTasksPage: vi.fn(),
  connection: vi.fn(),
  redirect: vi.fn(),
  taskBoardLoadingState: vi.fn(),
  taskBoardServerPage: vi.fn(),
  taskProgressPage: vi.fn(),
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
  listWorkspaceTaskBoards: (
    ...args: Parameters<typeof mocks.listWorkspaceTaskBoards>
  ) => mocks.listWorkspaceTaskBoards(...args),
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

vi.mock('@tuturuuu/tasks-ui/tu-do/my-tasks/my-tasks-page', () => ({
  default: mocks.myTasksPage,
}));

vi.mock(
  '@tuturuuu/tasks-ui/tu-do/boards/boardId/task-board-server-page',
  () => ({
    default: mocks.taskBoardServerPage,
  })
);

vi.mock('@tuturuuu/tasks-ui/tu-do/shared/task-board-loading-state', () => ({
  TaskBoardLoadingState: mocks.taskBoardLoadingState,
}));

vi.mock('@tuturuuu/tasks-ui/tu-do/boards/workspace-projects-page', () => ({
  default: mocks.workspaceProjectsPage,
}));

vi.mock('@tuturuuu/tasks-ui/progress/task-progress-page', () => ({
  TaskProgressPage: mocks.taskProgressPage,
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
    mocks.listWorkspaceTaskBoards.mockResolvedValue({
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
    mocks.listWorkspaceTaskBoards.mockResolvedValue({ boards: [], count: 0 });

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
    mocks.listWorkspaceTaskBoards
      .mockResolvedValueOnce({ boards: [], count: 0 })
      .mockResolvedValueOnce({
        boards: [
          {
            archived_at: null,
            deleted_at: null,
            id: 'board-race-winner',
            name: 'Race winner',
          },
        ],
        count: 1,
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
    expect(mocks.listWorkspaceTaskBoards).toHaveBeenCalledTimes(2);
  });

  it('refetches boards when an auto-create conflict returns no board', async () => {
    mocks.listWorkspaceTaskBoards
      .mockResolvedValueOnce({ boards: [], count: 0 })
      .mockResolvedValueOnce({
        boards: [
          {
            archived_at: null,
            deleted_at: null,
            id: 'board-payload-race-winner',
            name: 'Race winner',
          },
        ],
        count: 1,
      });
    mocks.createWorkspaceTaskBoard.mockResolvedValue({ board: null });

    const { default: Page } = await import(
      '@/app/[locale]/(dashboard)/[wsId]/tasks/page'
    );

    await expect(
      Page({ params: Promise.resolve({ wsId: 'workspace-1' }) })
    ).rejects.toMatchObject({
      href: '/workspace-1/boards/board-payload-race-winner',
    });
    expect(mocks.listWorkspaceTaskBoards).toHaveBeenCalledTimes(2);
  });

  it('coalesces concurrent default-board initialization', async () => {
    mocks.listWorkspaceTaskBoards.mockResolvedValue({ boards: [], count: 0 });
    let finishCreate:
      | ((value: { board: { id: string; name: string } }) => void)
      | undefined;
    mocks.createWorkspaceTaskBoard.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishCreate = resolve;
        })
    );
    mocks.listWorkspaceTaskLists.mockResolvedValue({ lists: [] });
    const { resolveTaskBoardEntrypoint } = await import(
      '@/app/[locale]/(dashboard)/[wsId]/task-board-entrypoint'
    );

    const first = resolveTaskBoardEntrypoint('workspace-concurrent', {
      baseUrl: 'http://first.test',
    });
    const second = resolveTaskBoardEntrypoint('workspace-concurrent', {
      baseUrl: 'http://second.test',
    });
    await vi.waitFor(() =>
      expect(mocks.createWorkspaceTaskBoard).toHaveBeenCalledTimes(1)
    );
    finishCreate?.({ board: { id: 'board-shared', name: 'Shared' } });

    await expect(Promise.all([first, second])).resolves.toEqual([
      'board-shared',
      'board-shared',
    ]);
    expect(mocks.createWorkspaceTaskBoard).toHaveBeenCalledTimes(1);
  });

  it('uses the repairing task-board endpoint for new personal accounts', async () => {
    mocks.listWorkspaceTaskBoards.mockResolvedValue({
      boards: [{ id: 'personal-default', name: 'Tasks' }],
      count: 1,
    });
    mocks.getWorkspace.mockResolvedValue({
      id: 'personal-workspace',
      joined: true,
      personal: true,
    });

    const { default: Page } = await import(
      '@/app/[locale]/(dashboard)/[wsId]/tasks/page'
    );

    await expect(
      Page({ params: Promise.resolve({ wsId: 'personal' }) })
    ).rejects.toMatchObject({ href: '/personal/boards/personal-default' });
    expect(mocks.listWorkspaceTaskBoards).toHaveBeenCalledWith(
      'personal-workspace',
      { status: 'active' },
      { auth: 'forwarded' }
    );
    expect(mocks.createWorkspaceTaskBoard).not.toHaveBeenCalled();
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
        sessionUser: { id: 'user-1' },
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

  it('exposes autonomous task intelligence as first-class destinations', async () => {
    const { getNavigationLinks } = await import(
      '@/app/[locale]/(dashboard)/[wsId]/navigation'
    );

    const links = await getNavigationLinks({ personalOrWsId: 'workspace-1' });

    expect(links).toHaveLength(6);
    expect(links[0]).toMatchObject({
      href: '/workspace-1/tasks',
      aliases: [
        '/workspace-1/tasks/*',
        '/workspace-1/boards',
        '/workspace-1/boards/*',
      ],
    });
    expect(links[1]).toBeNull();
    expect(links[2]).toMatchObject({
      href: '/workspace-1/progress',
      aliases: ['/workspace-1/progress/*'],
    });
    expect(links[3]).toMatchObject({
      href: '/workspace-1/goals',
      aliases: ['/workspace-1/goals/*'],
    });
    expect(links[4]).toMatchObject({
      href: '/workspace-1/analytics',
      aliases: ['/workspace-1/analytics/*'],
    });
    expect(links[5]).toMatchObject({
      href: '/workspace-1/leaderboard',
      aliases: ['/workspace-1/leaderboard/*'],
    });
  });

  it('renders each task intelligence route with the matching view', async () => {
    const [
      { default: Goals },
      { default: Analytics },
      { default: Leaderboard },
    ] = await Promise.all([
      import('@/app/[locale]/(dashboard)/[wsId]/goals/page'),
      import('@/app/[locale]/(dashboard)/[wsId]/analytics/page'),
      import('@/app/[locale]/(dashboard)/[wsId]/leaderboard/page'),
    ]);

    const params = Promise.resolve({ wsId: 'workspace-1' });
    const results = await Promise.all([
      Goals({ params }),
      Analytics({ params }),
      Leaderboard({ params }),
    ]);

    expect(results.map((result) => result.props.view)).toEqual([
      'goals',
      'stats',
      'leaderboards',
    ]);
    expect(
      results.every((result) => result.type === mocks.taskProgressPage)
    ).toBe(true);
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
    expect(mocks.listWorkspaceTaskBoards).not.toHaveBeenCalled();
  });
});
