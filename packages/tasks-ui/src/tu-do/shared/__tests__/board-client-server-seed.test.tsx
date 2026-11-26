import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setActiveBoardRefresh } from '../board-broadcast-context';
import { BoardClient } from '../board-client';
import { writeTaskBoardCache } from '../task-board-cache';

const useWorkspaceLabelsMock = vi.fn();
const getWorkspaceTaskBoardMock = vi.fn();
const listWorkspaceTasksMock = vi.fn();
const useProgressiveBoardLoaderMock = vi.fn();
const useBoardRealtimeMock = vi.fn();
const revalidateLoadedListsMock = vi.fn();

vi.mock('@tuturuuu/internal-api/tasks', () => ({
  getWorkspaceTaskBoard: (...args: unknown[]) =>
    getWorkspaceTaskBoardMock(...args),
  listWorkspaceTasks: (...args: unknown[]) => listWorkspaceTasksMock(...args),
}));

vi.mock('@tuturuuu/utils/task-helper', () => ({
  useWorkspaceLabels: (...args: unknown[]) => useWorkspaceLabelsMock(...args),
}));

vi.mock('@tuturuuu/tasks-ui/hooks/useBoardRealtime', () => ({
  useBoardRealtime: (...args: unknown[]) => {
    useBoardRealtimeMock(...args);
    return { broadcast: null };
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: vi.fn(),
  }),
}));

vi.mock('../use-progressive-board-loader', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../use-progressive-board-loader')>()),
  useProgressiveBoardLoader: (...args: unknown[]) => {
    useProgressiveBoardLoaderMock(...args);
    return {
      pagination: {},
      loadListPage: vi.fn(),
      revalidateLoadedLists: revalidateLoadedListsMock,
    };
  },
}));

vi.mock('../recent-sidebar-events', () => ({
  dispatchRecentSidebarVisit: vi.fn(),
}));

vi.mock('../board-views', () => ({
  BoardViews: () => <div data-testid="board-views" />,
}));

describe('BoardClient server seed', () => {
  beforeEach(() => {
    localStorage.clear();
    useWorkspaceLabelsMock.mockReset();
    useWorkspaceLabelsMock.mockReturnValue({ data: [] });
    getWorkspaceTaskBoardMock.mockReset();
    listWorkspaceTasksMock.mockReset();
    listWorkspaceTasksMock.mockResolvedValue({ tasks: [] });
    getWorkspaceTaskBoardMock.mockResolvedValue({
      board: {
        id: 'board-1',
        name: 'Roadmap',
        ws_id: 'board-ws-uuid',
        task_lists: [
          {
            id: 'list-1',
            board_id: 'board-1',
            name: 'To Do',
            status: 'not_started',
            color: 'BLUE',
            position: 0,
            archived: false,
          },
        ],
      },
    });
    useBoardRealtimeMock.mockReset();
    useProgressiveBoardLoaderMock.mockReset();
    revalidateLoadedListsMock.mockReset();
    revalidateLoadedListsMock.mockResolvedValue(undefined);
    setActiveBoardRefresh(null);
  });

  it('primes tasks, pagination and preferences from the server render', async () => {
    writeTaskBoardCache('user-1:board-ws-uuid', 'board-1', {
      board: {
        id: 'board-1',
        name: 'Cached roadmap',
        ws_id: 'board-ws-uuid',
        task_lists: [],
      } as any,
      pagination: {},
      tasks: [{ id: 'stale', name: 'Stale', list_id: 'list-1' } as any],
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <BoardClient
          boardId="board-1"
          currentUserId="user-1"
          workspace={{ id: 'board-ws-uuid', personal: false } as any}
          initialBoard={
            {
              id: 'board-1',
              name: 'Server board',
              ws_id: 'board-ws-uuid',
              task_lists: [],
              access_type: 'member',
            } as any
          }
          initialListPages={{
            'list-1': {
              tasks: [
                { id: 'task-1', name: 'Fresh', list_id: 'list-1' } as any,
              ],
              count: 1,
            },
            'list-2': { tasks: [], count: 0 },
          }}
          initialPreferences={{
            userConfigs: {
              TASK_PERSIST_COLLAPSED_LISTS: 'false',
              TASK_HIDE_EMPTY_LISTS: null,
            },
            workspaceConfigs: {
              TASK_BOARD_PINNED_SPECIAL_LISTS: '{"done":true}',
            },
          }}
        />
      </QueryClientProvider>
    );

    expect(queryClient.getQueryData(['tasks', 'board-1'])).toEqual([
      { id: 'task-1', name: 'Fresh', list_id: 'list-1' },
    ]);
    expect(useProgressiveBoardLoaderMock).toHaveBeenCalledWith(
      'board-ws-uuid',
      'board-1',
      {
        'list-1': {
          page: 0,
          hasMore: false,
          totalCount: 1,
          firstPageTaskCount: 1,
          isLoading: false,
          isInitialLoad: false,
        },
        'list-2': {
          page: 0,
          hasMore: false,
          totalCount: 0,
          firstPageTaskCount: 0,
          isLoading: false,
          isInitialLoad: false,
        },
      }
    );
    expect(
      queryClient.getQueryData(['user-config', 'TASK_PERSIST_COLLAPSED_LISTS'])
    ).toBe('false');
    expect(
      queryClient.getQueryData(['user-config', 'TASK_HIDE_EMPTY_LISTS'])
    ).toBe('false');
    expect(
      queryClient.getQueryData([
        'user-config',
        'TASK_AUTO_COLLAPSE_EMPTY_LISTS',
      ])
    ).toBeUndefined();
    expect(
      queryClient.getQueryData([
        'user-workspace-config',
        'board-ws-uuid',
        'TASK_BOARD_PINNED_SPECIAL_LISTS',
      ])
    ).toBe('{"done":true}');

    // The fresher server pages win over the browser snapshot, which would
    // otherwise trigger a revalidation of every list on mount.
    await act(async () => {});
    expect(queryClient.getQueryData(['tasks', 'board-1'])).toEqual([
      { id: 'task-1', name: 'Fresh', list_id: 'list-1' },
    ]);
    expect(revalidateLoadedListsMock).not.toHaveBeenCalled();
    expect(listWorkspaceTasksMock).not.toHaveBeenCalled();
    queryClient.clear();
  });

  it('keeps cached edits newer than the server snapshot and replaces older ones', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    // Edited in this tab after the (preloaded) page model was read.
    queryClient.setQueryData(
      ['tasks', 'board-1'],
      [{ id: 'local', name: 'Local edit', list_id: 'list-1' }],
      { updatedAt: 2_000 }
    );
    queryClient.setQueryData(['user-config', 'TASK_HIDE_EMPTY_LISTS'], 'true', {
      updatedAt: 2_000,
    });
    // Cached before the snapshot was read.
    queryClient.setQueryData(
      ['user-config', 'TASK_PERSIST_COLLAPSED_LISTS'],
      'true',
      { updatedAt: 500 }
    );
    render(
      <QueryClientProvider client={queryClient}>
        <BoardClient
          boardId="board-1"
          currentUserId="user-1"
          workspace={{ id: 'board-ws-uuid', personal: false } as any}
          initialBoard={
            {
              id: 'board-1',
              ws_id: 'board-ws-uuid',
              task_lists: [],
              access_type: 'member',
            } as any
          }
          initialListPages={{
            'list-1': {
              tasks: [
                { id: 'server', name: 'Server', list_id: 'list-1' } as any,
              ],
              count: 1,
            },
          }}
          initialPreferences={{
            userConfigs: {
              TASK_PERSIST_COLLAPSED_LISTS: 'false',
              TASK_HIDE_EMPTY_LISTS: 'false',
            },
            workspaceConfigs: {},
          }}
          initialSnapshotAt={1_000}
        />
      </QueryClientProvider>
    );

    expect(queryClient.getQueryData(['tasks', 'board-1'])).toEqual([
      { id: 'local', name: 'Local edit', list_id: 'list-1' },
    ]);
    expect(
      queryClient.getQueryData(['user-config', 'TASK_HIDE_EMPTY_LISTS'])
    ).toBe('true');
    expect(
      queryClient.getQueryData(['user-config', 'TASK_PERSIST_COLLAPSED_LISTS'])
    ).toBe('false');
    // Kept local tasks leave the columns to load their own pages.
    expect(useProgressiveBoardLoaderMock).toHaveBeenCalledWith(
      'board-ws-uuid',
      'board-1',
      undefined
    );
    queryClient.clear();
  });

  it('does not re-apply the mount snapshot when the same board reloads', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const board = {
      id: 'board-1',
      ws_id: 'board-ws-uuid',
      task_lists: [],
      access_type: 'member',
    } as any;
    const view = (snapshotAt: number, name: string) => (
      <QueryClientProvider client={queryClient}>
        <BoardClient
          boardId="board-1"
          currentUserId="user-1"
          workspace={{ id: 'board-ws-uuid', personal: false } as any}
          initialBoard={board}
          initialListPages={{
            'list-1': {
              tasks: [{ id: 'task-1', name, list_id: 'list-1' } as any],
              count: 1,
            },
          }}
          initialSnapshotAt={snapshotAt}
        />
      </QueryClientProvider>
    );
    const { rerender } = render(view(1_000, 'Mounted'));
    queryClient.setQueryData(
      ['tasks', 'board-1'],
      [{ id: 'task-1', name: 'Edited', list_id: 'list-1' }],
      { updatedAt: 2_000 }
    );
    rerender(view(5_000, 'Reloaded'));
    await act(async () => {});

    expect(queryClient.getQueryData(['tasks', 'board-1'])).toEqual([
      { id: 'task-1', name: 'Edited', list_id: 'list-1' },
    ]);
    queryClient.clear();
  });

  it('ignores the browser copy when a newer live cache wins over server pages', async () => {
    writeTaskBoardCache('user-1:board-ws-uuid', 'board-1', {
      board: { id: 'board-1', ws_id: 'board-ws-uuid', task_lists: [] } as any,
      pagination: {},
      tasks: [{ id: 'deleted', name: 'Deleted', list_id: 'list-1' } as any],
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(['tasks', 'board-1'], [], { updatedAt: 2_000 });
    render(
      <QueryClientProvider client={queryClient}>
        <BoardClient
          boardId="board-1"
          currentUserId="user-1"
          workspace={{ id: 'board-ws-uuid', personal: false } as any}
          initialBoard={
            {
              id: 'board-1',
              ws_id: 'board-ws-uuid',
              task_lists: [],
              access_type: 'member',
            } as any
          }
          initialListPages={{ 'list-1': { tasks: [], count: 0 } }}
          initialSnapshotAt={1_000}
        />
      </QueryClientProvider>
    );
    await act(async () => {});

    expect(queryClient.getQueryData(['tasks', 'board-1'])).toEqual([]);
    expect(revalidateLoadedListsMock).not.toHaveBeenCalled();
    queryClient.clear();
  });

  it('never seeds another board with the mount board pages', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const view = (boardId: string) => (
      <QueryClientProvider client={queryClient}>
        <BoardClient
          boardId={boardId}
          currentUserId="user-1"
          workspace={{ id: 'board-ws-uuid', personal: false } as any}
          initialBoard={
            {
              id: boardId,
              ws_id: 'board-ws-uuid',
              task_lists: [],
              access_type: 'member',
            } as any
          }
          initialListPages={{
            'list-1': {
              tasks: [{ id: `${boardId}-task`, list_id: 'list-1' } as any],
              count: 1,
            },
          }}
          initialSnapshotAt={1_000}
        />
      </QueryClientProvider>
    );
    const { rerender } = render(view('board-1'));
    rerender(view('board-2'));
    await act(async () => {});

    expect(queryClient.getQueryData(['tasks', 'board-2'])).not.toEqual([
      { id: 'board-1-task', list_id: 'list-1' },
    ]);
    expect(queryClient.getQueryData(['tasks', 'board-1'])).toEqual([
      { id: 'board-1-task', list_id: 'list-1' },
    ]);
    queryClient.clear();
  });
});
