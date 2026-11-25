import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createWorkspaceTaskBoard: vi.fn(),
  getUserWorkspaceConfig: vi.fn(),
  listWorkspaceTaskBoards: vi.fn(),
  listWorkspaceTaskLists: vi.fn(),
  updateWorkspaceTaskList: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api', () => ({
  createWorkspaceTaskBoard: mocks.createWorkspaceTaskBoard,
  getUserWorkspaceConfig: mocks.getUserWorkspaceConfig,
  listWorkspaceTaskBoards: mocks.listWorkspaceTaskBoards,
  listWorkspaceTaskLists: mocks.listWorkspaceTaskLists,
  TASK_DEFAULT_BOARD_ID_CONFIG_ID: 'TASK_DEFAULT_BOARD_ID',
  updateWorkspaceTaskList: mocks.updateWorkspaceTaskList,
}));

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));

const { resolveTaskBoardEntrypoint } = await import('./task-board-entrypoint');

const auth = { defaultHeaders: { authorization: 'Bearer member' } };

describe('resolveTaskBoardEntrypoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads the preferred board while the board list loads', async () => {
    let finishBoards:
      | ((value: { boards: { id: string }[]; count: number }) => void)
      | undefined;
    mocks.listWorkspaceTaskBoards.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishBoards = resolve;
        })
    );
    mocks.getUserWorkspaceConfig.mockResolvedValueOnce({ value: 'board-2' });

    const resolution = resolveTaskBoardEntrypoint('ws-1', auth);

    await vi.waitFor(() =>
      expect(mocks.getUserWorkspaceConfig).toHaveBeenCalledWith(
        'ws-1',
        'TASK_DEFAULT_BOARD_ID',
        auth
      )
    );
    finishBoards?.({
      boards: [{ id: 'board-1' }, { id: 'board-2' }],
      count: 2,
    });

    await expect(resolution).resolves.toBe('board-2');
  });

  it('opens the first board when the preference is unreadable or stale', async () => {
    mocks.listWorkspaceTaskBoards.mockResolvedValue({
      boards: [{ id: 'board-1' }],
      count: 1,
    });
    mocks.getUserWorkspaceConfig
      .mockRejectedValueOnce(new Error('config unavailable'))
      .mockResolvedValueOnce({ value: 'deleted-board' });

    await expect(resolveTaskBoardEntrypoint('ws-1', auth)).resolves.toBe(
      'board-1'
    );
    await expect(resolveTaskBoardEntrypoint('ws-1', auth)).resolves.toBe(
      'board-1'
    );
  });
});
