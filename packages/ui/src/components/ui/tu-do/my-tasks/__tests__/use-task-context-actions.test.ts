import { renderHook } from '@testing-library/react';
import type { TaskWithRelations } from '@tuturuuu/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskContextActions } from '../use-task-context-actions';

// Hoisted mocks — vi.hoisted() makes these available at vi.mock() hoist time
const {
  mockInvalidateQueries,
  mockSetQueriesData,
  mockFrom,
  mockSelect,
  mockUpdate,
  mockDelete,
  mockInsert,
  mockEq,
  mockT,
  mockToastError,
} = vi.hoisted(() => ({
  mockInvalidateQueries: vi.fn(),
  mockSetQueriesData: vi.fn(),
  mockFrom: vi.fn(),
  mockSelect: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockInsert: vi.fn(),
  mockEq: vi.fn(),
  mockT: vi.fn((key: string) => key),
  mockToastError: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
    setQueriesData: mockSetQueriesData,
  }),
}));

vi.mock('@tuturuuu/supabase/next/client', () => ({
  createClient: () => ({ from: mockFrom }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => mockT,
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    error: mockToastError,
  },
}));

// Mock fetch
global.fetch = vi.fn();

describe('useTaskContextActions', () => {
  const mockTask: TaskWithRelations = {
    id: 'task-123',
    name: 'Test Task',
    description: null,
    priority: 'normal',
    start_date: null,
    end_date: null,
    list_id: 'list-1',
    created_at: '2026-01-01T00:00:00Z',
    list: {
      id: 'list-1',
      name: 'Active',
      status: 'active',
      board: {
        id: 'board-1',
        name: 'Test Board',
        ws_id: 'ws-1',
        workspaces: { id: 'ws-1', name: 'Test WS', personal: false },
      },
    },
    labels: [],
    assignees: [],
    overrides: null,
  };

  const userId = 'user-1';
  const onTaskUpdate = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default Supabase mock chain - each method must return a chainable object
    mockEq.mockResolvedValue({ data: null, error: null });
    mockSelect.mockReturnValue({ eq: mockEq });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockDelete.mockReturnValue({ eq: mockEq });
    mockInsert.mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({
      select: mockSelect,
      update: mockUpdate,
      delete: mockDelete,
      insert: mockInsert,
    });
  });

  it('handleDoneWithMyPart sends PUT with personally_unassigned=true', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: {} }),
    });

    const { result } = renderHook(() =>
      useTaskContextActions({
        task: mockTask,
        userId,
        onTaskUpdate,
        onClose,
      })
    );

    await result.current.handleDoneWithMyPart();

    expect(global.fetch).toHaveBeenCalledWith(
      `/api/v1/users/me/tasks/${mockTask.id}/overrides`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personally_unassigned: true }),
      }
    );
    expect(onTaskUpdate).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('handleUndoDoneWithMyPart sends PUT with both flags cleared', async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: {} }),
    });

    const { result } = renderHook(() =>
      useTaskContextActions({
        task: mockTask,
        userId,
        onTaskUpdate,
        onClose,
      })
    );

    await result.current.handleUndoDoneWithMyPart();

    expect(global.fetch).toHaveBeenCalledWith(
      `/api/v1/users/me/tasks/${mockTask.id}/overrides`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personally_unassigned: false,
          completed_at: null,
        }),
      }
    );
    expect(onTaskUpdate).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('handleComplete clears overrides when task has completed_at override', async () => {
    const taskWithOverrides = {
      ...mockTask,
      overrides: {
        task_id: 'task-123',
        user_id: 'user-1',
        self_managed: false,
        completed_at: '2026-01-01T00:00:00Z',
        priority_override: null,
        due_date_override: null,
        estimation_override: null,
        personally_unassigned: false,
        notes: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    };

    // Track all from() calls
    const fromCalls: string[] = [];
    mockFrom.mockImplementation((table: string) => {
      fromCalls.push(table);
      if (table === 'task_lists') {
        // select().eq('board_id', ...).eq('deleted', false)
        const eqDeleted = vi.fn().mockResolvedValue({
          data: [
            { id: 'list-1', status: 'active' },
            { id: 'list-2', status: 'done' },
          ],
          error: null,
        });
        const eqBoardId = vi.fn().mockReturnValue({ eq: eqDeleted });
        return { select: vi.fn().mockReturnValue({ eq: eqBoardId }) };
      }
      if (table === 'tasks') {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      }
      return { select: mockSelect, update: mockUpdate, delete: mockDelete };
    });

    // Mock fetch for override cleanup
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: {} }),
    });

    const { result } = renderHook(() =>
      useTaskContextActions({
        task: taskWithOverrides,
        userId,
        onTaskUpdate,
        onClose,
      })
    );

    await result.current.handleComplete();

    // Verify Supabase operations happened in order
    expect(fromCalls).toContain('task_lists');
    expect(fromCalls).toContain('tasks');

    // Verify override cleanup
    expect(global.fetch).toHaveBeenCalledWith(
      `/api/v1/users/me/tasks/${taskWithOverrides.id}/overrides`,
      expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  it('handleComplete clears overrides when task has personally_unassigned', async () => {
    const taskWithPersonallyUnassigned = {
      ...mockTask,
      overrides: {
        task_id: 'task-123',
        user_id: 'user-1',
        self_managed: false,
        completed_at: null,
        priority_override: null,
        due_date_override: null,
        estimation_override: null,
        personally_unassigned: true,
        notes: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    };

    // Proper chained .eq() mocks: select().eq('board_id', ...).eq('deleted', false)
    mockFrom.mockImplementation((table: string) => {
      if (table === 'task_lists') {
        const eqDeleted = vi.fn().mockResolvedValue({
          data: [{ id: 'list-done', status: 'done' }],
          error: null,
        });
        const eqBoardId = vi.fn().mockReturnValue({ eq: eqDeleted });
        return { select: vi.fn().mockReturnValue({ eq: eqBoardId }) };
      }
      if (table === 'tasks') {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      }
      return { select: mockSelect, update: mockUpdate, delete: mockDelete };
    });

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
    });

    const { result } = renderHook(() =>
      useTaskContextActions({
        task: taskWithPersonallyUnassigned,
        userId,
        onTaskUpdate,
        onClose,
      })
    );

    await result.current.handleComplete();

    expect(global.fetch).toHaveBeenCalled();
    expect(onTaskUpdate).toHaveBeenCalled();
  });

  it('handleDelete sends update with deleted_at', async () => {
    mockEq.mockResolvedValueOnce({ data: null, error: null });

    const { result } = renderHook(() =>
      useTaskContextActions({
        task: mockTask,
        userId,
        onTaskUpdate,
        onClose,
      })
    );

    await result.current.handleDelete();

    expect(mockFrom).toHaveBeenCalledWith('tasks');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        deleted_at: expect.any(String),
      })
    );
    expect(mockEq).toHaveBeenCalledWith('id', mockTask.id);
    expect(onTaskUpdate).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('handlePriorityChange updates task priority via Supabase', async () => {
    mockEq.mockResolvedValueOnce({ data: null, error: null });

    const { result } = renderHook(() =>
      useTaskContextActions({
        task: mockTask,
        userId,
        onTaskUpdate,
        onClose,
      })
    );

    await result.current.handlePriorityChange('high');

    expect(mockFrom).toHaveBeenCalledWith('tasks');
    expect(mockUpdate).toHaveBeenCalledWith({ priority: 'high' });
    expect(mockEq).toHaveBeenCalledWith('id', mockTask.id);
    expect(mockInvalidateQueries).toHaveBeenCalled();
  });

  it('handleUnassignMe deletes from task_assignees', async () => {
    // Setup chained mocks for delete operation with multiple .eq() calls
    const mockEqChain2 = vi.fn().mockResolvedValue({ data: null, error: null });
    const mockEqChain1 = vi.fn().mockReturnValue({ eq: mockEqChain2 });
    mockDelete.mockReturnValue({ eq: mockEqChain1 });

    const { result } = renderHook(() =>
      useTaskContextActions({
        task: mockTask,
        userId,
        onTaskUpdate,
        onClose,
      })
    );

    await result.current.handleUnassignMe();

    expect(mockFrom).toHaveBeenCalledWith('task_assignees');
    expect(mockDelete).toHaveBeenCalled();
    expect(mockEqChain1).toHaveBeenCalledWith('task_id', mockTask.id);
    expect(mockEqChain2).toHaveBeenCalledWith('user_id', userId);
    expect(onTaskUpdate).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('handles error in handleDoneWithMyPart', async () => {
    (global.fetch as any).mockResolvedValueOnce({ ok: false });

    const { result } = renderHook(() =>
      useTaskContextActions({
        task: mockTask,
        userId,
        onTaskUpdate,
        onClose,
      })
    );

    await result.current.handleDoneWithMyPart();

    expect(mockToastError).toHaveBeenCalledWith('failed_to_update');
    expect(onTaskUpdate).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('handles error in handleDelete', async () => {
    // Setup mock to return error
    const mockEqWithError = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'Database error' },
    });
    mockUpdate.mockReturnValue({ eq: mockEqWithError });

    const { result } = renderHook(() =>
      useTaskContextActions({
        task: mockTask,
        userId,
        onTaskUpdate,
        onClose,
      })
    );

    await result.current.handleDelete();

    expect(mockToastError).toHaveBeenCalledWith('failed_to_update');
    expect(onTaskUpdate).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('handles error in handlePriorityChange', async () => {
    // Setup mock to return error
    const mockEqWithError = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'Update failed' },
    });
    mockUpdate.mockReturnValue({ eq: mockEqWithError });

    const { result } = renderHook(() =>
      useTaskContextActions({
        task: mockTask,
        userId,
        onTaskUpdate,
        onClose,
      })
    );

    await result.current.handlePriorityChange('low');

    expect(mockToastError).toHaveBeenCalledWith('failed_to_update');
    expect(mockInvalidateQueries).toHaveBeenCalled();
  });

  it('optimistically updates cache when calling handleUnassignMe', async () => {
    mockEq.mockResolvedValueOnce({ data: null, error: null });

    const { result } = renderHook(() =>
      useTaskContextActions({
        task: mockTask,
        userId,
        onTaskUpdate,
        onClose,
      })
    );

    await result.current.handleUnassignMe();

    expect(mockSetQueriesData).toHaveBeenCalled();
    const setQueriesDataCall = mockSetQueriesData.mock.calls[0]!;
    expect(setQueriesDataCall[0]).toEqual({ queryKey: ['my-tasks'] });
  });

  it('handleDueDateChange updates end_date correctly', async () => {
    mockEq.mockResolvedValueOnce({ data: null, error: null });

    const { result } = renderHook(() =>
      useTaskContextActions({
        task: mockTask,
        userId,
        onTaskUpdate,
        onClose,
      })
    );

    await result.current.handleDueDateChange(7); // 7 days

    expect(mockFrom).toHaveBeenCalledWith('tasks');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        end_date: expect.any(String),
      })
    );
    expect(mockInvalidateQueries).toHaveBeenCalled();
  });

  it('handleToggleLabel adds label when not present', async () => {
    mockEq.mockResolvedValueOnce({ data: null, error: null });

    const { result } = renderHook(() =>
      useTaskContextActions({
        task: mockTask,
        userId,
        onTaskUpdate,
        onClose,
      })
    );

    await result.current.handleToggleLabel('label-1');

    expect(mockFrom).toHaveBeenCalledWith('task_labels');
    expect(mockInsert).toHaveBeenCalledWith({
      task_id: mockTask.id,
      label_id: 'label-1',
    });
    expect(mockInvalidateQueries).toHaveBeenCalled();
  });

  it('handleToggleLabel removes label when present', async () => {
    const taskWithLabel = {
      ...mockTask,
      labels: [
        {
          label: {
            id: 'label-1',
            name: 'Bug',
            color: 'red',
            created_at: '2026-01-01T00:00:00Z',
          },
        },
      ],
    };

    // Setup chained mocks for delete operation
    const mockEqChain = vi.fn();
    mockEqChain.mockReturnValueOnce({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    mockDelete.mockReturnValue({ eq: mockEqChain });

    const { result } = renderHook(() =>
      useTaskContextActions({
        task: taskWithLabel,
        userId,
        onTaskUpdate,
        onClose,
      })
    );

    await result.current.handleToggleLabel('label-1');

    expect(mockFrom).toHaveBeenCalledWith('task_labels');
    expect(mockDelete).toHaveBeenCalled();
    expect(mockEqChain).toHaveBeenCalledWith('task_id', taskWithLabel.id);
    expect(mockInvalidateQueries).toHaveBeenCalled();
  });

  it('handleUndoComplete moves task back to active list', async () => {
    // Track all from() calls
    const fromCalls: string[] = [];
    mockFrom.mockImplementation((table: string) => {
      fromCalls.push(table);
      if (table === 'task_lists') {
        // select().eq('board_id', ...).eq('deleted', false)
        const eqDeleted = vi.fn().mockResolvedValue({
          data: [
            { id: 'list-active', status: 'active' },
            { id: 'list-done', status: 'done' },
          ],
          error: null,
        });
        const eqBoardId = vi.fn().mockReturnValue({ eq: eqDeleted });
        return { select: vi.fn().mockReturnValue({ eq: eqBoardId }) };
      }
      if (table === 'tasks') {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        };
      }
      return { select: mockSelect, update: mockUpdate, delete: mockDelete };
    });

    const { result } = renderHook(() =>
      useTaskContextActions({
        task: mockTask,
        userId,
        onTaskUpdate,
        onClose,
      })
    );

    await result.current.handleUndoComplete();

    // Verify the function called task_lists first, then tasks
    expect(fromCalls).toContain('task_lists');
    expect(fromCalls).toContain('tasks');
    expect(onTaskUpdate).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
