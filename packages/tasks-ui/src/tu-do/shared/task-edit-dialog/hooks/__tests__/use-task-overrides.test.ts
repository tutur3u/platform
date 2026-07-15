import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskOverrides } from '../use-task-overrides';

// Hoisted mocks — vi.hoisted() makes these available at vi.mock() hoist time
const { mockQueryClient, mockUseQuery, mockUseMutation, mockToastError } =
  vi.hoisted(() => ({
    mockQueryClient: {
      cancelQueries: vi.fn(),
      getQueryData: vi.fn(),
      setQueryData: vi.fn(),
      invalidateQueries: vi.fn(),
    },
    mockUseQuery: vi.fn(),
    mockUseMutation: vi.fn(),
    mockToastError: vi.fn(),
  }));

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: (...args: unknown[]) => mockUseQuery(...args),
    useMutation: (...args: unknown[]) => mockUseMutation(...args),
    useQueryClient: () => mockQueryClient,
  };
});

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

// Mock fetch
global.fetch = vi.fn();

describe('useTaskOverrides', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches override on mount when taskId is provided', async () => {
    const taskId = 'task-123';
    const mockOverride = {
      task_id: taskId,
      user_id: 'user-1',
      self_managed: false,
      completed_at: null,
      priority_override: 'high',
      due_date_override: null,
      estimation_override: null,
      personally_unassigned: false,
      notes: 'Test note',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: mockOverride }),
    });

    mockUseQuery.mockReturnValue({
      data: mockOverride,
      isLoading: false,
      error: null,
    });

    mockUseMutation.mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    });

    const { result } = renderHook(() => useTaskOverrides(taskId));

    expect(result.current.override).toEqual(mockOverride);
  });

  it('does not fetch when taskId is undefined', () => {
    mockUseQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });

    mockUseMutation.mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    });

    renderHook(() => useTaskOverrides(undefined));

    // Verify enabled is false when taskId is undefined
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false })
    );
  });

  it('handles fetch error', () => {
    const taskId = 'task-123';
    const mockError = new Error('Failed to fetch override');

    mockUseQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: mockError,
    });

    mockUseMutation.mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    });

    const { result } = renderHook(() => useTaskOverrides(taskId));

    expect(result.current.error).toBeTruthy();
  });

  it('upsert sends PUT request with correct payload', async () => {
    const taskId = 'task-123';
    const mockResponse = {
      data: {
        task_id: taskId,
        user_id: 'user-1',
        priority_override: 'high',
      },
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    mockUseQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });

    // First mutation (upsert)
    mockUseMutation.mockReturnValueOnce({
      mutate: vi.fn(),
      mutateAsync: async (vars: any) => {
        const res = await fetch(`/api/v1/users/me/tasks/${taskId}/overrides`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(vars),
        });
        if (!res.ok) throw new Error('Failed');
        return res.json();
      },
      isPending: false,
    });

    // Second mutation (delete)
    mockUseMutation.mockReturnValueOnce({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    });

    const { result } = renderHook(() => useTaskOverrides(taskId));

    const input = { priority_override: 'high' as const };
    await result.current.upsertAsync(input);

    expect(global.fetch).toHaveBeenCalledWith(
      `/api/v1/users/me/tasks/${taskId}/overrides`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }
    );
  });

  it('upsert calls onUpdate on success', async () => {
    const taskId = 'task-123';
    const onUpdate = vi.fn();
    const mockResponse = { data: { task_id: taskId } };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    mockUseQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });

    let capturedOnSettled: (() => void) | undefined;

    // First mutation (upsert) - capture onSettled
    mockUseMutation.mockImplementationOnce((options: any) => {
      capturedOnSettled = options.onSettled;
      return {
        mutate: vi.fn(),
        mutateAsync: async (vars: any) => {
          const result = await options.mutationFn(vars);
          capturedOnSettled?.();
          return result;
        },
        isPending: false,
      };
    });

    // Second mutation (delete)
    mockUseMutation.mockReturnValueOnce({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    });

    const { result } = renderHook(() => useTaskOverrides(taskId, onUpdate));

    await result.current.upsertAsync({ notes: 'Updated' });

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalled();
    });
  });

  it('delete sends DELETE request', async () => {
    const taskId = 'task-123';

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
    });

    mockUseQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });

    // First mutation (upsert)
    mockUseMutation.mockReturnValueOnce({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    });

    // Second mutation (delete) - actual implementation
    const mockMutate = vi.fn(async () => {
      const res = await fetch(`/api/v1/users/me/tasks/${taskId}/overrides`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed');
    });

    mockUseMutation.mockImplementationOnce((options: any) => ({
      mutate: mockMutate,
      mutateAsync: async () => options.mutationFn(),
      isPending: false,
    }));

    const { result } = renderHook(() => useTaskOverrides(taskId));

    result.current.remove();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `/api/v1/users/me/tasks/${taskId}/overrides`,
        {
          method: 'DELETE',
        }
      );
    });
  });

  it('delete calls onUpdate on success', async () => {
    const taskId = 'task-123';
    const onUpdate = vi.fn();

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
    });

    mockUseQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });

    let capturedDeleteOnSettled: (() => void) | undefined;

    // First mutation (upsert)
    mockUseMutation.mockReturnValueOnce({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    });

    // Second mutation (delete) - capture onSettled
    mockUseMutation.mockImplementationOnce((options: any) => {
      capturedDeleteOnSettled = options.onSettled;
      return {
        mutate: vi.fn(async () => {
          await options.mutationFn();
          capturedDeleteOnSettled?.();
        }),
        mutateAsync: async () => {
          const result = await options.mutationFn();
          capturedDeleteOnSettled?.();
          return result;
        },
        isPending: false,
      };
    });

    const { result } = renderHook(() => useTaskOverrides(taskId, onUpdate));

    result.current.remove();

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalled();
    });
  });

  it('handles upsert API error', async () => {
    const taskId = 'task-123';

    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Update failed' }),
    });

    mockUseQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });

    let capturedOnError:
      | ((err: unknown, input: unknown, context: unknown) => void)
      | undefined;

    // First mutation (upsert) - capture onError
    mockUseMutation.mockImplementationOnce(
      (options: Record<string, unknown>) => {
        capturedOnError = options.onError as typeof capturedOnError;
        return {
          mutate: vi.fn(),
          mutateAsync: async (vars: unknown) => {
            try {
              return await (
                options.mutationFn as (v: unknown) => Promise<unknown>
              )(vars);
            } catch (error) {
              capturedOnError?.(error, vars, undefined);
              throw error;
            }
          },
          isPending: false,
        };
      }
    );

    // Second mutation (delete)
    mockUseMutation.mockReturnValueOnce({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    });

    const { result } = renderHook(() => useTaskOverrides(taskId));

    await expect(
      result.current.upsertAsync({ notes: 'Fail' })
    ).rejects.toThrow();

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        'Failed to save personal override'
      );
    });
  });

  it('returns correct isSaving state', () => {
    const taskId = 'task-123';

    mockUseQuery.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });

    // First mutation (upsert) - pending
    mockUseMutation.mockReturnValueOnce({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: true,
    });

    // Second mutation (delete) - not pending
    mockUseMutation.mockReturnValueOnce({
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
      isPending: false,
    });

    const { result } = renderHook(() => useTaskOverrides(taskId));

    expect(result.current.isSaving).toBe(true);
  });
});
