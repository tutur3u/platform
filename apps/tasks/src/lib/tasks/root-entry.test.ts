import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCurrentUserDefaultWorkspace: vi.fn(),
  getUserConfig: vi.fn(),
  resolveTaskBoardEntrypoint: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api', () => ({
  getCurrentUserDefaultWorkspace: (
    ...args: Parameters<typeof mocks.getCurrentUserDefaultWorkspace>
  ) => mocks.getCurrentUserDefaultWorkspace(...args),
  getUserConfig: (...args: Parameters<typeof mocks.getUserConfig>) =>
    mocks.getUserConfig(...args),
}));

vi.mock('./task-board-entrypoint', () => ({
  resolveTaskBoardEntrypoint: (
    ...args: Parameters<typeof mocks.resolveTaskBoardEntrypoint>
  ) => mocks.resolveTaskBoardEntrypoint(...args),
}));

const { resolveTasksRootEntry } = await import('./root-entry');

const auth = { defaultHeaders: { authorization: 'Bearer member' } };

describe('resolveTasksRootEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveTaskBoardEntrypoint.mockImplementation(
      async (target: string) => `${target}-board`
    );
  });

  it('resolves the personal board while the workspace preference loads', async () => {
    let finishConfig: ((value: { value: string }) => void) | undefined;
    mocks.getUserConfig.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishConfig = resolve;
        })
    );

    const entry = resolveTasksRootEntry({
      auth,
      locale: 'en',
      localePrefixed: false,
      search: '',
    });

    await vi.waitFor(() =>
      expect(mocks.resolveTaskBoardEntrypoint).toHaveBeenCalledWith(
        'personal',
        auth,
        { locale: 'en' }
      )
    );
    finishConfig?.({ value: 'false' });

    await expect(entry).resolves.toEqual({
      kind: 'board',
      target: 'personal',
      path: '/personal/boards/personal-board',
    });
    expect(mocks.resolveTaskBoardEntrypoint).toHaveBeenCalledTimes(1);
  });

  it('opens the forced default workspace instead of the personal board', async () => {
    mocks.getUserConfig.mockResolvedValueOnce({ value: 'true' });
    mocks.getCurrentUserDefaultWorkspace.mockResolvedValueOnce({
      id: 'workspace-1',
      personal: false,
    });

    await expect(
      resolveTasksRootEntry({
        auth,
        locale: 'vi',
        localePrefixed: true,
        search: '?tab=tasks',
      })
    ).resolves.toEqual({
      kind: 'board',
      target: 'workspace-1',
      path: '/vi/workspace-1/boards/workspace-1-board?tab=tasks',
    });
  });

  it('ignores a failed personal resolution when another workspace wins', async () => {
    mocks.resolveTaskBoardEntrypoint.mockImplementation(
      async (target: string) => {
        if (target === 'personal') throw new Error('personal unavailable');
        return `${target}-board`;
      }
    );
    mocks.getUserConfig.mockResolvedValueOnce({ value: 'true' });
    mocks.getCurrentUserDefaultWorkspace.mockResolvedValueOnce({
      id: 'workspace-1',
      personal: false,
    });

    await expect(
      resolveTasksRootEntry({
        auth,
        locale: 'en',
        localePrefixed: false,
        search: '',
      })
    ).resolves.toMatchObject({
      kind: 'board',
      path: '/workspace-1/boards/workspace-1-board',
    });
  });

  it('falls back to the task entrypoint when the personal board fails', async () => {
    mocks.getUserConfig.mockResolvedValueOnce(null);
    mocks.resolveTaskBoardEntrypoint.mockRejectedValueOnce(
      new Error('Board API unavailable')
    );

    await expect(
      resolveTasksRootEntry({
        auth,
        locale: 'en',
        localePrefixed: false,
        search: '',
      })
    ).resolves.toEqual({
      kind: 'entrypoint',
      target: 'personal',
      path: '/en/personal/tasks',
    });
  });
});
