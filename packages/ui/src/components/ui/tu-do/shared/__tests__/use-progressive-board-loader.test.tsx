/**
 * @vitest-environment jsdom
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProgressiveBoardLoader } from '../use-progressive-board-loader';

describe('useProgressiveBoardLoader', () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ tasks: [] }),
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('upserts incoming task records instead of preserving stale cache entries', async () => {
    const cachedTask: Task = {
      id: 'task-1',
      display_number: 1,
      name: 'Done task',
      list_id: 'list-1',
      created_at: '2026-03-19T00:00:00.000Z',
    };

    queryClient.setQueryData(['tasks', 'board-1'], [cachedTask]);

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tasks: [
          {
            ...cachedTask,
            completed_at: '2026-03-19T01:00:00.000Z',
          },
        ],
      }),
    } as Response);

    const { result } = renderHook(
      () => useProgressiveBoardLoader('ws-1', 'board-1'),
      { wrapper }
    );

    await act(async () => {
      await result.current.loadListPage('list-1', 0);
    });

    expect(queryClient.getQueryData<Task[]>(['tasks', 'board-1'])).toEqual([
      {
        ...cachedTask,
        completed_at: '2026-03-19T01:00:00.000Z',
      },
    ]);
  });

  it('appends newly discovered tasks after merging existing ones', async () => {
    const cachedTask: Task = {
      id: 'task-1',
      display_number: 1,
      name: 'Existing task',
      list_id: 'list-1',
      created_at: '2026-03-19T00:00:00.000Z',
    };

    queryClient.setQueryData(['tasks', 'board-1'], [cachedTask]);

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tasks: [
          {
            ...cachedTask,
            completed_at: '2026-03-19T01:00:00.000Z',
          },
          {
            id: 'task-2',
            display_number: 2,
            name: 'New task',
            list_id: 'list-1',
            created_at: '2026-03-19T02:00:00.000Z',
          },
        ],
      }),
    } as Response);

    const { result } = renderHook(
      () => useProgressiveBoardLoader('ws-1', 'board-1'),
      { wrapper }
    );

    await act(async () => {
      await result.current.loadListPage('list-1', 0);
    });

    expect(queryClient.getQueryData<Task[]>(['tasks', 'board-1'])).toEqual([
      {
        ...cachedTask,
        completed_at: '2026-03-19T01:00:00.000Z',
      },
      {
        id: 'task-2',
        display_number: 2,
        name: 'New task',
        list_id: 'list-1',
        created_at: '2026-03-19T02:00:00.000Z',
      },
    ]);
  });
});
