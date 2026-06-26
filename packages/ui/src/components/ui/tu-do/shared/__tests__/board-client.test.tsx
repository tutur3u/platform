import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getActiveBoardRefresh,
  setActiveBoardRefresh,
} from '../board-broadcast-context';
import { BoardClient } from '../board-client';

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

vi.mock('@tuturuuu/ui/hooks/useBoardRealtime', () => ({
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

vi.mock('../use-progressive-board-loader', () => ({
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

describe('BoardClient', () => {
  beforeEach(() => {
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loads dependent board data with the fetched board workspace id', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <BoardClient
          boardId="board-1"
          workspace={{ id: 'workspace-uuid', personal: false } as any}
          currentUserId="user-1"
        />
      </QueryClientProvider>
    );

    expect(await screen.findByTestId('board-views')).toBeInTheDocument();
    expect(useWorkspaceLabelsMock).toHaveBeenCalledWith('board-ws-uuid');
    expect(useProgressiveBoardLoaderMock).toHaveBeenCalledWith(
      'board-ws-uuid',
      'board-1'
    );
  });

  it('refreshes board task cache without relationship summaries', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <BoardClient
          boardId="board-1"
          workspace={{ id: 'workspace-uuid', personal: false } as any}
          currentUserId="user-1"
        />
      </QueryClientProvider>
    );

    expect(await screen.findByTestId('board-views')).toBeInTheDocument();
    await waitFor(() => {
      expect(getActiveBoardRefresh()).toBeInstanceOf(Function);
    });

    await act(async () => {
      getActiveBoardRefresh()?.();
    });

    await waitFor(() => {
      expect(listWorkspaceTasksMock).toHaveBeenCalledWith('board-ws-uuid', {
        boardId: 'board-1',
        includeRelationshipSummary: false,
      });
    });
  });

  it('uses the shared task board loading state while the board query resolves', () => {
    getWorkspaceTaskBoardMock.mockReturnValue(new Promise(() => {}));
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <BoardClient
          boardId="board-1"
          workspace={{ id: 'workspace-uuid', personal: false } as any}
          currentUserId="user-1"
        />
      </QueryClientProvider>
    );

    expect(screen.getByTestId('task-board-loading-state')).toBeInTheDocument();
    expect(screen.getByTestId('task-board-loading-state')).not.toHaveClass(
      '-m-4'
    );
    expect(screen.getByTestId('kanban-skeleton')).toBeInTheDocument();
    expect(screen.queryByText('Loading board...')).not.toBeInTheDocument();
  });

  it('can render the shared task board loading state as a full-bleed route root', () => {
    getWorkspaceTaskBoardMock.mockReturnValue(new Promise(() => {}));
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <BoardClient
          boardId="board-1"
          workspace={{ id: 'workspace-uuid', personal: false } as any}
          currentUserId="user-1"
          rootLoading
        />
      </QueryClientProvider>
    );

    expect(screen.getByTestId('task-board-loading-state')).toHaveClass(
      '-m-4',
      'h-[calc(100dvh+2rem)]',
      'w-[calc(100%+2rem)]'
    );
  });

  it('can revalidate loaded board lists without invalidating visible task caches', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    render(
      <QueryClientProvider client={queryClient}>
        <BoardClient
          boardId="board-1"
          workspace={{ id: 'workspace-uuid', personal: false } as any}
          currentUserId="user-1"
        />
      </QueryClientProvider>
    );

    expect(await screen.findByTestId('board-views')).toBeInTheDocument();

    await waitFor(() => {
      expect(getActiveBoardRefresh()).toBeInstanceOf(Function);
    });

    await act(async () => {
      getActiveBoardRefresh()?.({ invalidateTasks: false });
    });

    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: ['tasks', 'board-1'],
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: ['tasks-full', 'board-1'],
    });
    expect(revalidateLoadedListsMock).toHaveBeenCalledTimes(1);
  });

  it('revalidates loaded lists for relation broadcasts without invalidating visible task caches', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    render(
      <QueryClientProvider client={queryClient}>
        <BoardClient
          boardId="board-1"
          workspace={{ id: 'workspace-uuid', personal: false } as any}
          currentUserId="user-1"
        />
      </QueryClientProvider>
    );

    expect(await screen.findByTestId('board-views')).toBeInTheDocument();

    const realtimeOptions = useBoardRealtimeMock.mock.calls.find(
      ([boardId]) => boardId === 'board-1'
    )?.[1] as
      | {
          onTaskRelationsChange?: (taskIds: string[]) => void;
        }
      | undefined;

    await act(async () => {
      realtimeOptions?.onTaskRelationsChange?.(['task-1']);
    });

    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: ['tasks', 'board-1'],
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({
      queryKey: ['tasks-full', 'board-1'],
    });
    expect(revalidateLoadedListsMock).toHaveBeenCalledTimes(1);
  });

  it('throttles focus-driven list revalidation for thirty seconds', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(100_000);
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <BoardClient
          boardId="board-1"
          workspace={{ id: 'workspace-uuid', personal: false } as any}
          currentUserId="user-1"
        />
      </QueryClientProvider>
    );

    expect(await screen.findByTestId('board-views')).toBeInTheDocument();

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() => {
      expect(revalidateLoadedListsMock).toHaveBeenCalledTimes(1);
    });

    nowSpy.mockReturnValue(101_500);

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(revalidateLoadedListsMock).toHaveBeenCalledTimes(1);

    nowSpy.mockReturnValue(130_000);

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() => {
      expect(revalidateLoadedListsMock).toHaveBeenCalledTimes(2);
    });
  });
});
