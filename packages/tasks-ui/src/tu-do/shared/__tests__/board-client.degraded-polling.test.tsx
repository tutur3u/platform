import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BoardClient } from '../board-client';

const useWorkspaceLabelsMock = vi.fn();
const useBoardRealtimeMock = vi.fn();
const revalidateLoadedListsMock = vi.fn();

vi.mock('@tuturuuu/internal-api/tasks', () => ({
  getWorkspaceTaskBoard: vi.fn(),
  listWorkspaceTasks: vi.fn().mockResolvedValue({ tasks: [] }),
}));

vi.mock('@tuturuuu/utils/task-helper', () => ({
  useWorkspaceLabels: (...args: unknown[]) => useWorkspaceLabelsMock(...args),
}));

vi.mock('@tuturuuu/tasks-ui/hooks/useBoardRealtime', () => ({
  useBoardRealtime: (...args: unknown[]) =>
    useBoardRealtimeMock(...args) ?? { broadcast: null, isDegraded: false },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock('../use-progressive-board-loader', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../use-progressive-board-loader')>()),
  useProgressiveBoardLoader: () => ({
    pagination: {},
    loadListPage: vi.fn(),
    revalidateLoadedLists: revalidateLoadedListsMock,
  }),
}));

vi.mock('../recent-sidebar-events', () => ({
  dispatchRecentSidebarVisit: vi.fn(),
}));

vi.mock('../board-views', () => ({
  BoardViews: () => <div data-testid="board-views" />,
}));

function renderBoard(queryClient: QueryClient) {
  return (
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
      />
    </QueryClientProvider>
  );
}

describe('BoardClient degraded realtime polling', () => {
  beforeEach(() => {
    localStorage.clear();
    useWorkspaceLabelsMock.mockReset();
    useWorkspaceLabelsMock.mockReturnValue({ data: [] });
    useBoardRealtimeMock.mockReset();
    revalidateLoadedListsMock.mockReset();
    revalidateLoadedListsMock.mockResolvedValue(undefined);
  });

  it('polls periodically while realtime is degraded and stops on recovery', async () => {
    vi.useFakeTimers();
    const visibility = vi
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValue('visible');
    useBoardRealtimeMock.mockReturnValue({ broadcast: null, isDegraded: true });

    try {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      const { rerender } = render(renderBoard(queryClient));

      expect(revalidateLoadedListsMock).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(revalidateLoadedListsMock).toHaveBeenCalledTimes(1);

      visibility.mockReturnValue('hidden');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(revalidateLoadedListsMock).toHaveBeenCalledTimes(1);

      visibility.mockReturnValue('visible');
      useBoardRealtimeMock.mockReturnValue({
        broadcast: null,
        isDegraded: false,
      });
      rerender(renderBoard(queryClient));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(20_000);
      });
      expect(revalidateLoadedListsMock).toHaveBeenCalledTimes(1);
    } finally {
      visibility.mockRestore();
      vi.useRealTimers();
    }
  });

  it('skips overlapping degraded polls while a previous revalidation is still in flight', async () => {
    vi.useFakeTimers();
    const visibility = vi
      .spyOn(document, 'visibilityState', 'get')
      .mockReturnValue('visible');
    useBoardRealtimeMock.mockReturnValue({ broadcast: null, isDegraded: true });

    let resolveFirst: (() => void) | undefined;
    revalidateLoadedListsMock.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve;
        })
    );

    try {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      render(renderBoard(queryClient));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(revalidateLoadedListsMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(revalidateLoadedListsMock).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveFirst?.();
        await Promise.resolve();
      });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(revalidateLoadedListsMock).toHaveBeenCalledTimes(2);
    } finally {
      visibility.mockRestore();
      vi.useRealTimers();
    }
  });
});
