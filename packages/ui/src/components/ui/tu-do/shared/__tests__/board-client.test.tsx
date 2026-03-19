import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BoardClient } from '../board-client';

const useWorkspaceLabelsMock = vi.fn();

vi.mock('@tuturuuu/utils/task-helper', () => ({
  useWorkspaceLabels: (...args: unknown[]) => useWorkspaceLabelsMock(...args),
}));

vi.mock('@tuturuuu/ui/hooks/useBoardRealtime', () => ({
  useBoardRealtime: () => ({ broadcast: null }),
}));

vi.mock('../use-progressive-board-loader', () => ({
  useProgressiveBoardLoader: () => ({
    pagination: {},
    loadListPage: vi.fn(),
  }),
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
  });

  it('loads workspace labels with the resolved workspace id instead of the board ws_id slug', () => {
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
          workspace={{ id: 'workspace-uuid', personal: false } as any}
          initialBoard={
            {
              id: 'board-1',
              name: 'Roadmap',
              ws_id: 'internal',
            } as any
          }
          initialLists={[]}
          currentUserId="user-1"
        />
      </QueryClientProvider>
    );

    expect(screen.getByTestId('board-views')).toBeInTheDocument();
    expect(useWorkspaceLabelsMock).toHaveBeenCalledWith('workspace-uuid');
  });
});
