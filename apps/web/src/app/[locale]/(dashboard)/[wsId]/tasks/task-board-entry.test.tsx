import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class MockInternalApiError extends Error {
    constructor(
      message: string,
      public readonly status: number,
      public readonly code?: string
    ) {
      super(message);
      this.name = 'InternalApiError';
    }
  }

  return {
    getCurrentUser: vi.fn(),
    getUserWorkspaceConfig: vi.fn(),
    getWorkspace: vi.fn(),
    headers: vi.fn(),
    InternalApiError: MockInternalApiError,
    listWorkspaceTaskBoards: vi.fn(),
    notFound: vi.fn(() => {
      throw new Error('NEXT_NOT_FOUND');
    }),
    redirect: vi.fn((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    }),
    TasksNoBoardClient: vi.fn(),
    withForwardedInternalApiAuth: vi.fn(() => ({ auth: 'forwarded' })),
  };
});

vi.mock('@tuturuuu/internal-api', () => ({
  InternalApiError: mocks.InternalApiError,
  listWorkspaceTaskBoards: (
    ...args: Parameters<typeof mocks.listWorkspaceTaskBoards>
  ) => mocks.listWorkspaceTaskBoards(...args),
  withForwardedInternalApiAuth: (
    ...args: Parameters<typeof mocks.withForwardedInternalApiAuth>
  ) => mocks.withForwardedInternalApiAuth(...args),
}));

vi.mock('@tuturuuu/internal-api/users', () => ({
  getUserWorkspaceConfig: (
    ...args: Parameters<typeof mocks.getUserWorkspaceConfig>
  ) => mocks.getUserWorkspaceConfig(...args),
  TASK_DEFAULT_BOARD_ID_CONFIG_ID: 'TASK_DEFAULT_BOARD_ID',
}));

vi.mock('@tuturuuu/utils/user-helper', () => ({
  getCurrentUser: (...args: Parameters<typeof mocks.getCurrentUser>) =>
    mocks.getCurrentUser(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getWorkspace: (...args: Parameters<typeof mocks.getWorkspace>) =>
    mocks.getWorkspace(...args),
}));

vi.mock('next/headers', () => ({
  headers: (...args: Parameters<typeof mocks.headers>) =>
    mocks.headers(...args),
}));

vi.mock('next/navigation', () => ({
  notFound: (...args: Parameters<typeof mocks.notFound>) =>
    mocks.notFound(...args),
  redirect: (...args: Parameters<typeof mocks.redirect>) =>
    mocks.redirect(...args),
}));

vi.mock('./tasks-no-board-client', () => ({
  TasksNoBoardClient: mocks.TasksNoBoardClient,
}));

import { TaskBoardEntryPage } from './task-board-entry';

type CreateBoardElement = ReactElement<{
  initialView?: string;
  routeWsId: string;
  workspaceId: string;
}>;

function renderEntry() {
  return TaskBoardEntryPage({
    params: Promise.resolve({ wsId: 'ws-1' }),
  }) as Promise<CreateBoardElement>;
}

describe('TaskBoardEntryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({
      email: 'member@example.com',
      id: 'user-1',
    });
    mocks.getUserWorkspaceConfig.mockResolvedValue({ value: null });
    mocks.headers.mockResolvedValue(new Headers({ cookie: 'session=1' }));
  });

  it('redirects board guests without requiring workspace membership metadata', async () => {
    mocks.listWorkspaceTaskBoards.mockResolvedValue({
      access_type: 'guest',
      boards: [{ id: 'board-guest', ws_id: 'ws-guest' }],
      count: 1,
    });

    await expect(renderEntry()).rejects.toThrow(
      'NEXT_REDIRECT:/ws-1/tasks/boards/board-guest'
    );

    expect(mocks.listWorkspaceTaskBoards).toHaveBeenCalledWith(
      'ws-1',
      {
        page: 1,
        pageSize: 100,
        status: 'active',
      },
      { auth: 'forwarded' }
    );
    expect(mocks.getWorkspace).not.toHaveBeenCalled();
    expect(mocks.getUserWorkspaceConfig).not.toHaveBeenCalled();
  });

  it('redirects members to an accessible configured default board', async () => {
    mocks.listWorkspaceTaskBoards.mockResolvedValue({
      access_type: 'member',
      boards: [
        { id: 'board-first', ws_id: 'ws-member' },
        { id: 'board-default', ws_id: 'ws-member' },
      ],
      count: 2,
    });
    mocks.getUserWorkspaceConfig.mockResolvedValue({
      value: 'board-default',
    });

    await expect(renderEntry()).rejects.toThrow(
      'NEXT_REDIRECT:/ws-1/tasks/boards/board-default'
    );

    expect(mocks.getUserWorkspaceConfig).toHaveBeenCalledWith(
      'ws-member',
      'TASK_DEFAULT_BOARD_ID',
      { auth: 'forwarded' }
    );
    expect(mocks.getWorkspace).not.toHaveBeenCalled();
  });

  it('renders the board creation fallback for members with no active boards', async () => {
    mocks.listWorkspaceTaskBoards.mockResolvedValue({
      boards: [],
      count: 0,
    });
    mocks.getWorkspace.mockResolvedValue({
      id: 'ws-member',
      joined: true,
      personal: false,
      tier: 'FREE',
    });

    const element = await renderEntry();

    expect(element.type).toBe(mocks.TasksNoBoardClient);
    expect(element.props).toMatchObject({
      initialView: 'kanban',
      routeWsId: 'ws-1',
      workspaceId: 'ws-member',
    });
  });

  it('treats inaccessible workspace task entries as not found', async () => {
    mocks.listWorkspaceTaskBoards.mockRejectedValue(
      new mocks.InternalApiError('Forbidden', 403)
    );

    await expect(renderEntry()).rejects.toThrow('NEXT_NOT_FOUND');

    expect(mocks.getWorkspace).not.toHaveBeenCalled();
  });
});
