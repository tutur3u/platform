import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getTaskScheduleBatch = vi.fn();
vi.mock('@tuturuuu/internal-api/tasks-scheduling', () => ({
  getTaskScheduleBatch: (...args: unknown[]) => getTaskScheduleBatch(...args),
}));
vi.mock('@tuturuuu/ui/hooks/use-workspace-visibility', () => ({
  useWorkspaceActor: () => ({ actorId: 'actor', assertActive: () => {} }),
}));

import { useTaskScheduleBatch } from './use-task-schedule-batch';

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const input = {
  wsId: 'ws',
  taskIds: ['b', 'a', 'a'],
  isPersonalWorkspace: false,
};

describe('task schedule batch', () => {
  beforeEach(() => {
    getTaskScheduleBatch.mockReset();
    client = new QueryClient({
      defaultOptions: { queries: { retryDelay: 0 } },
    });
  });

  it('loads once for the deduplicated task set', async () => {
    getTaskScheduleBatch.mockResolvedValue({
      minutesByTaskId: { a: 30 },
      settingsByTaskId: { a: null, b: null },
    });
    const { result } = renderHook(() => useTaskScheduleBatch(input), {
      wrapper,
    });
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.minutesByTaskId).toEqual({ a: 30 });
    expect(getTaskScheduleBatch).toHaveBeenCalledTimes(1);
    expect(getTaskScheduleBatch.mock.calls[0]?.[1]).toEqual(['a', 'b']);
  });

  it('stops reporting loading after the batch fails', async () => {
    getTaskScheduleBatch.mockImplementation(async () => {
      throw new Error('unavailable');
    });
    const { result } = renderHook(() => useTaskScheduleBatch(input), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.settingsByTaskId).toEqual({});
  });

  it('never loads for an empty task set', () => {
    const { result } = renderHook(
      () => useTaskScheduleBatch({ ...input, taskIds: [] }),
      { wrapper }
    );
    expect(result.current.isLoading).toBe(false);
    expect(getTaskScheduleBatch).not.toHaveBeenCalled();
  });
});
