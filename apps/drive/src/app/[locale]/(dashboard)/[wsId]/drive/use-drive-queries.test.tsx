import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DRIVE_FETCH_PAGE_SIZE } from './search-params';
import {
  useWorkspaceStorageAnalyticsQuery,
  useWorkspaceStorageDirectoryQuery,
} from './use-drive-queries';

const { getWorkspaceStorageAnalyticsMock, listWorkspaceStorageObjectsMock } =
  vi.hoisted(() => ({
    getWorkspaceStorageAnalyticsMock: vi.fn(),
    listWorkspaceStorageObjectsMock: vi.fn(),
  }));

vi.mock('@tuturuuu/internal-api', () => ({
  getWorkspaceStorageAnalytics: (
    ...args: Parameters<typeof getWorkspaceStorageAnalyticsMock>
  ) => getWorkspaceStorageAnalyticsMock(...args),
  listWorkspaceStorageObjects: (
    ...args: Parameters<typeof listWorkspaceStorageObjectsMock>
  ) => listWorkspaceStorageObjectsMock(...args),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('Drive query hooks', () => {
  beforeEach(() => {
    getWorkspaceStorageAnalyticsMock.mockReset();
    listWorkspaceStorageObjectsMock.mockReset();
  });

  it('loads directory data with workspace-scoped params and appends the next batch on demand', async () => {
    let resolvePageTwo: ((value: unknown) => void) | undefined;

    listWorkspaceStorageObjectsMock
      .mockResolvedValueOnce({
        data: [{ id: 'file-1', name: 'first.txt', metadata: { size: 10 } }],
        pagination: {
          limit: DRIVE_FETCH_PAGE_SIZE,
          offset: 0,
          total: DRIVE_FETCH_PAGE_SIZE + 1,
        },
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolvePageTwo = resolve;
          })
      );

    const { result } = renderHook(
      () =>
        useWorkspaceStorageDirectoryQuery('ws-1', {
          path: 'design',
          q: '  board  ',
          sortBy: 'created_at',
          sortOrder: 'desc',
        }),
      {
        wrapper: createWrapper(),
      }
    );

    await waitFor(() => {
      expect(result.current.data?.items[0]?.name).toBe('first.txt');
    });

    expect(listWorkspaceStorageObjectsMock).toHaveBeenNthCalledWith(
      1,
      'ws-1',
      {
        limit: DRIVE_FETCH_PAGE_SIZE,
        offset: 0,
        path: 'design',
        search: 'board',
        sortBy: 'created_at',
        sortOrder: 'desc',
      },
      { fetch }
    );

    const fetchNextPagePromise = act(async () => {
      await result.current.fetchNextPage();
    });

    expect(result.current.data?.items.map((item) => item.name)).toEqual([
      'first.txt',
    ]);

    resolvePageTwo?.({
      data: [{ id: 'file-2', name: 'second.txt', metadata: { size: 12 } }],
      pagination: {
        limit: DRIVE_FETCH_PAGE_SIZE,
        offset: DRIVE_FETCH_PAGE_SIZE,
        total: DRIVE_FETCH_PAGE_SIZE + 1,
      },
    });

    await fetchNextPagePromise;

    await waitFor(() => {
      expect(result.current.data?.items.map((item) => item.name)).toEqual([
        'first.txt',
        'second.txt',
      ]);
    });

    expect(listWorkspaceStorageObjectsMock).toHaveBeenNthCalledWith(
      2,
      'ws-1',
      {
        limit: DRIVE_FETCH_PAGE_SIZE,
        offset: DRIVE_FETCH_PAGE_SIZE,
        path: 'design',
        search: 'board',
        sortBy: 'created_at',
        sortOrder: 'desc',
      },
      { fetch }
    );

    expect(result.current.hasNextPage).toBe(false);
  });

  it('drops previous data while a different folder route is loading', async () => {
    let resolveNextFolder: ((value: unknown) => void) | undefined;

    listWorkspaceStorageObjectsMock
      .mockResolvedValueOnce({
        data: [{ id: 'file-1', name: 'first.txt', metadata: { size: 10 } }],
        pagination: {
          limit: DRIVE_FETCH_PAGE_SIZE,
          offset: 0,
          total: 1,
        },
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveNextFolder = resolve;
          })
      );

    const { result, rerender } = renderHook(
      ({ path }) =>
        useWorkspaceStorageDirectoryQuery('ws-1', {
          path,
          q: '',
          sortBy: 'created_at',
          sortOrder: 'desc',
        }),
      {
        initialProps: { path: 'design' },
        wrapper: createWrapper(),
      }
    );

    await waitFor(() => {
      expect(result.current.data?.items[0]?.name).toBe('first.txt');
    });

    rerender({ path: 'assets' });

    expect(result.current.data).toBeUndefined();
    expect(result.current.isPending).toBe(true);

    resolveNextFolder?.({
      data: [{ id: 'file-2', name: 'logo.png', metadata: { size: 12 } }],
      pagination: {
        limit: DRIVE_FETCH_PAGE_SIZE,
        offset: 0,
        total: 1,
      },
    });

    await waitFor(() => {
      expect(result.current.data?.items[0]?.name).toBe('logo.png');
    });
  });

  it('loads workspace storage analytics through the workspace-scoped helper', async () => {
    getWorkspaceStorageAnalyticsMock.mockResolvedValue({
      data: {
        totalSize: 100,
        fileCount: 3,
        storageLimit: 1000,
        usagePercentage: 10,
        largestFile: null,
        smallestFile: null,
      },
    });

    const { result } = renderHook(
      () => useWorkspaceStorageAnalyticsQuery('ws-1'),
      {
        wrapper: createWrapper(),
      }
    );

    await waitFor(() => {
      expect(result.current.data?.usagePercentage).toBe(10);
    });

    expect(getWorkspaceStorageAnalyticsMock).toHaveBeenCalledWith('ws-1', {
      fetch,
    });
  });
});
