import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUpdateSharedTask } from '../use-update-shared-task';

// Mock TanStack Query's useMutation
const mockMutate = vi.fn();
vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useMutation: vi.fn((options) => {
      return {
        mutate: mockMutate,
        mutateAsync: async (variables: any) => {
          return options.mutationFn(variables);
        },
        ...options,
      };
    }),
    useQueryClient: () => ({
      invalidateQueries: vi.fn(),
    }),
  };
});

// Mock fetch
global.fetch = vi.fn();

describe('useUpdateSharedTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully update a task', async () => {
    const mockResponse = { id: 'task-1', name: 'Updated Task' };
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const { result } = renderHook(() => useUpdateSharedTask());

    const payload = {
      shareCode: 'SHARE123',
      updates: { name: 'Updated Task' },
    };

    // Cast to any to access mutationFn which is available in the mock return value
    const response = await (result.current as any).mutationFn(payload);

    expect(global.fetch).toHaveBeenCalledWith('/api/v1/shared/tasks/SHARE123', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload.updates),
    });
    expect(response).toEqual(mockResponse);
  });

  it('should handle API errors', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Update failed' }),
    });

    const { result } = renderHook(() => useUpdateSharedTask());

    const payload = {
      shareCode: 'SHARE123',
      updates: { name: 'Fail Task' },
    };

    await expect((result.current as any).mutationFn(payload)).rejects.toThrow(
      'Update failed'
    );
  });

  it('should send correct payload structure', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const { result } = renderHook(() => useUpdateSharedTask());

    const updates = {
      name: 'New Name',
      priority: 'high',
      description: 'New Description',
    };

    await (result.current as any).mutationFn({
      shareCode: 'CODE',
      updates,
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('CODE'),
      expect.objectContaining({
        body: JSON.stringify(updates),
      })
    );
  });
});
