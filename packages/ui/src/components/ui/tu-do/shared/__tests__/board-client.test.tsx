import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BoardClient } from '../board-client';

const useWorkspaceLabelsMock = vi.fn();
const getWorkspaceTaskBoardMock = vi.fn();
const useProgressiveBoardLoaderMock = vi.fn();

vi.mock('@tuturuuu/internal-api/tasks', () => ({
  getWorkspaceTaskBoard: (...args: unknown[]) =>
    getWorkspaceTaskBoardMock(...args),
}));

vi.mock('@tuturuuu/utils/task-helper', () => ({
  useWorkspaceLabels: (...args: unknown[]) => useWorkspaceLabelsMock(...args),
}));

vi.mock('@tuturuuu/ui/hooks/useBoardRealtime', () => ({
  useBoardRealtime: () => ({ broadcast: null }),
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
      revalidateLoadedLists: vi.fn().mockResolvedValue(undefined),
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
    useProgressiveBoardLoaderMock.mockReset();
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
});
