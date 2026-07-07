import { isValidElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSatelliteAppSessionUser: vi.fn(),
  getTranslations: vi.fn(),
  getUserWorkspaceConfig: vi.fn(),
  getWorkspace: vi.fn(),
  headers: vi.fn(),
  listWorkspaceBoards: vi.fn(),
  myTasksPage: vi.fn(),
  connection: vi.fn(),
  redirect: vi.fn(),
  taskBoardLoadingState: vi.fn(),
  taskBoardServerPage: vi.fn(),
  toWorkspaceSlug: vi.fn(),
  withForwardedInternalApiAuth: vi.fn(),
  workspaceProjectsPage: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api', () => ({
  getUserWorkspaceConfig: (
    ...args: Parameters<typeof mocks.getUserWorkspaceConfig>
  ) => mocks.getUserWorkspaceConfig(...args),
  listWorkspaceBoards: (
    ...args: Parameters<typeof mocks.listWorkspaceBoards>
  ) => mocks.listWorkspaceBoards(...args),
  TASK_DEFAULT_BOARD_ID_CONFIG_ID: 'TASK_DEFAULT_BOARD_ID',
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

  it('keeps the My Tasks empty-board path when no board exists', async () => {
    mocks.listWorkspaceBoards.mockResolvedValue({ boards: [] });

    const { default: Page } = await import(
      '@/app/[locale]/(dashboard)/[wsId]/tasks/page'
    );

    const result = await Page({
      params: Promise.resolve({ wsId: 'workspace-1' }),
    });

    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(isValidElement(result)).toBe(true);
    expect(result).toMatchObject({
      props: expect.objectContaining({
        user: { id: 'user-1' },
      }),
      type: mocks.myTasksPage,
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

  it('opts the boards list route into request-time rendering', async () => {
    const { default: Page } = await import(
      '@/app/[locale]/(dashboard)/[wsId]/boards/page'
    );

    const params = Promise.resolve({ wsId: 'workspace-1' });
    const searchParams = Promise.resolve({ q: 'active' });
    const result = await Page({ params, searchParams });

    expect(mocks.connection).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      props: {
        params,
        searchParams,
      },
      type: mocks.workspaceProjectsPage,
    });
  });

  it('keeps Tasks navigation scoped to the main task and board routes', async () => {
    const { getNavigationLinks } = await import(
      '@/app/[locale]/(dashboard)/[wsId]/navigation'
    );

    const links = await getNavigationLinks({ personalOrWsId: 'workspace-1' });

    expect(links.map((link) => link?.href)).toEqual([
      '/workspace-1/tasks',
      '/workspace-1/boards',
    ]);
  });
});
