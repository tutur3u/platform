/**
 * @vitest-environment jsdom
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import { listWorkspaceTasks } from '@tuturuuu/internal-api/tasks';
import { type ReactNode, useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ListPaginationState } from '../progressive-loader-context';
import { useProgressiveBoardLoader } from '../use-progressive-board-loader';

vi.mock('@tuturuuu/internal-api/tasks', () => ({
  listWorkspaceTasks: vi.fn(),
}));

const cachedPagination: Record<string, ListPaginationState> = {
  'list-1': {
    page: 0,
    hasMore: false,
    totalCount: 1,
    isLoading: false,
    isInitialLoad: false,
  },
};

function HydrationHarness({
  initialPagination,
}: {
  initialPagination: Record<string, ListPaginationState>;
}) {
  const loader = useProgressiveBoardLoader(
    'ws-1',
    'board-1',
    initialPagination
  );

  useEffect(() => {
    if (Object.keys(initialPagination).length > 0) {
      void loader.revalidateLoadedLists();
    }
  }, [initialPagination, loader.revalidateLoadedLists]);

  return null;
}

describe('useProgressiveBoardLoader hydration revalidation', () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => ReactNode;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    wrapper = ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    vi.mocked(listWorkspaceTasks).mockReset();
    vi.mocked(listWorkspaceTasks).mockResolvedValue({ tasks: [] });
  });

  it('revalidates cached lists in the same effect pass that discovers them', async () => {
    const { rerender } = render(<HydrationHarness initialPagination={{}} />, {
      wrapper,
    });

    rerender(<HydrationHarness initialPagination={cachedPagination} />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(listWorkspaceTasks).toHaveBeenCalledWith('ws-1', {
      boardId: 'board-1',
      listId: 'list-1',
      limit: 50,
      offset: 0,
      includeCount: true,
      includeRelationshipSummary: false,
    });
  });
});
