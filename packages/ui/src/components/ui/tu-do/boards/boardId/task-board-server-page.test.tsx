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
    BoardClient: vi.fn(),
    getCurrentUser: vi.fn(),
    getWorkspace: vi.fn(),
    getWorkspaceTaskBoard: vi.fn(),
    headers: vi.fn(),
    InternalApiError: MockInternalApiError,
    notFound: vi.fn(() => {
      throw new Error('NEXT_NOT_FOUND');
    }),
    redirect: vi.fn((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    }),
    withForwardedInternalApiAuth: vi.fn(() => ({ auth: 'forwarded' })),
  };
});

vi.mock('@tuturuuu/ui/tu-do/shared/board-client', () => ({
  BoardClient: mocks.BoardClient,
}));

vi.mock('@tuturuuu/internal-api', () => ({
  getWorkspaceTaskBoard: (
    ...args: Parameters<typeof mocks.getWorkspaceTaskBoard>
  ) => mocks.getWorkspaceTaskBoard(...args),
  InternalApiError: mocks.InternalApiError,
  withForwardedInternalApiAuth: (
    ...args: Parameters<typeof mocks.withForwardedInternalApiAuth>
  ) => mocks.withForwardedInternalApiAuth(...args),
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

import TaskBoardServerPage from './task-board-server-page';

const BOARD_ID = '11111111-1111-1111-1111-111111111111';

type BoardClientElement = ReactElement<{
  currentUserId?: string;
  rootLoading?: boolean;
  workspace: unknown;
  workspaceTier: unknown;
}>;

function renderServerPage(options?: { rootLoading?: boolean }) {
  return TaskBoardServerPage({
    params: Promise.resolve({
      boardId: BOARD_ID,
      wsId: 'ws-1',
    }),
    rootLoading: options?.rootLoading,
  }) as Promise<BoardClientElement>;
}

describe('TaskBoardServerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({
      email: 'member@example.com',
      id: 'user-1',
    });
    mocks.headers.mockResolvedValue(new Headers({ cookie: 'session=1' }));
  });

  it('checks board access before fetching workspace metadata', async () => {
    mocks.getWorkspaceTaskBoard.mockRejectedValue(
      new mocks.InternalApiError('Forbidden', 403)
    );

    await expect(renderServerPage()).rejects.toThrow('NEXT_NOT_FOUND');

    expect(mocks.withForwardedInternalApiAuth).toHaveBeenCalledWith(
      expect.any(Headers)
    );
    expect(mocks.getWorkspaceTaskBoard).toHaveBeenCalledWith('ws-1', BOARD_ID, {
      auth: 'forwarded',
    });
    expect(mocks.getWorkspace).not.toHaveBeenCalled();
  });

  it('treats invalid board routes as not found instead of crashing the server render', async () => {
    mocks.getWorkspaceTaskBoard.mockRejectedValue(
      new mocks.InternalApiError('Invalid workspace or board ID', 400)
    );

    await expect(renderServerPage()).rejects.toThrow('NEXT_NOT_FOUND');

    expect(mocks.getWorkspace).not.toHaveBeenCalled();
  });

  it('keeps unexpected board loader failures visible', async () => {
    mocks.getWorkspaceTaskBoard.mockRejectedValue(
      new mocks.InternalApiError('Failed to load task board', 500)
    );

    await expect(renderServerPage()).rejects.toThrow(
      'Failed to load task board'
    );

    expect(mocks.getWorkspace).not.toHaveBeenCalled();
  });

  it('uses a minimal workspace shell for board guests', async () => {
    mocks.getWorkspaceTaskBoard.mockResolvedValue({
      board: {
        access_type: 'guest',
        id: BOARD_ID,
        ws_id: 'ws-guest',
      },
    });

    const element = await renderServerPage();

    expect(mocks.getWorkspace).not.toHaveBeenCalled();
    expect(element.type).toBe(mocks.BoardClient);
    expect(element.props.workspace).toEqual({
      id: 'ws-guest',
      joined: false,
      personal: false,
      tier: null,
    });
    expect(element.props.workspaceTier).toBeNull();
    expect(element.props.currentUserId).toBe('user-1');
  });

  it('loads the full member workspace from the resolved board workspace', async () => {
    const workspace = {
      creator_id: 'creator-1',
      id: 'ws-board',
      joined: true,
      name: 'Member Workspace',
      personal: false,
      tier: 'FREE',
    };
    mocks.getWorkspaceTaskBoard.mockResolvedValue({
      board: {
        access_type: 'member',
        id: BOARD_ID,
        ws_id: 'ws-board',
      },
    });
    mocks.getWorkspace.mockResolvedValue(workspace);

    const element = await renderServerPage();

    expect(mocks.getWorkspace).toHaveBeenCalledWith('ws-board', {
      useAdmin: true,
    });
    expect(element.type).toBe(mocks.BoardClient);
    expect(element.props.workspace).toBe(workspace);
    expect(element.props.workspaceTier).toBe('FREE');
  });

  it('passes full-bleed loading through to the board client when requested', async () => {
    const workspace = {
      id: 'ws-board',
      joined: true,
      personal: false,
      tier: 'FREE',
    };
    mocks.getWorkspaceTaskBoard.mockResolvedValue({
      board: {
        access_type: 'member',
        id: BOARD_ID,
        ws_id: 'ws-board',
      },
    });
    mocks.getWorkspace.mockResolvedValue(workspace);

    const element = await renderServerPage({ rootLoading: true });

    expect(element.props.rootLoading).toBe(true);
  });
});
