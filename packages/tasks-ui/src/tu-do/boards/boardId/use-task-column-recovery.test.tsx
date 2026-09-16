import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useTaskColumnRecovery } from './use-task-column-recovery';

function setup(overrides = {}) {
  const queryClient = new QueryClient();
  const loadColumnPage = vi.fn().mockResolvedValue(undefined);
  const props = {
    boardId: 'board',
    listId: 'list',
    taskCount: 1,
    enabled: true,
    listState: {
      page: 0,
      totalCount: 7,
      hasMore: false,
      isInitialLoad: false,
      isLoading: false,
    },
    loadColumnPage,
    ...overrides,
  };
  const hook = renderHook((value) => useTaskColumnRecovery(value), {
    initialProps: props,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
  return { ...hook, props, loadColumnPage, queryClient };
}

describe('task column recovery', () => {
  it('does not refetch valid partial pagination or filtered/collapsed columns', () => {
    const paginated = setup({
      taskCount: 50,
      listState: {
        page: 0,
        totalCount: 100,
        hasMore: true,
        isInitialLoad: false,
        isLoading: false,
      },
    });
    expect(paginated.loadColumnPage).not.toHaveBeenCalled();
    const filtered = setup({ enabled: false });
    expect(filtered.loadColumnPage).not.toHaveBeenCalled();
  });

  it('accepts short personal-list responses whose total includes other tasks', () => {
    for (const firstPageTaskCount of [undefined, 1]) {
      const { loadColumnPage } = setup({
        taskCount: 1,
        listState: {
          page: 0,
          totalCount: 9,
          hasMore: true,
          firstPageTaskCount,
          isInitialLoad: false,
          isLoading: false,
        },
      });
      expect(loadColumnPage).not.toHaveBeenCalled();
    }
  });

  it('recovers missing cached tasks using actual first-page membership', async () => {
    const { loadColumnPage } = setup({
      taskCount: 1,
      listState: {
        page: 0,
        totalCount: 9,
        hasMore: true,
        firstPageTaskCount: 7,
        isInitialLoad: false,
        isLoading: false,
      },
    });
    await waitFor(() =>
      expect(loadColumnPage).toHaveBeenCalledExactlyOnceWith(0)
    );
  });

  it('does not loop when a successful response leaves the same count mismatch', async () => {
    const { rerender, props, queryClient, loadColumnPage } = setup();
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    rerender({ ...props, enabled: false });
    rerender(props);
    expect(loadColumnPage).toHaveBeenCalledExactlyOnceWith(0);
  });

  it('settles a failed recovery without repeatedly requesting the page', async () => {
    const loadColumnPage = vi.fn().mockRejectedValue(new Error('offline'));
    const { queryClient } = setup({ loadColumnPage });
    await waitFor(() => expect(queryClient.isFetching()).toBe(0));
    expect(loadColumnPage).toHaveBeenCalledExactlyOnceWith(0);
  });
});
