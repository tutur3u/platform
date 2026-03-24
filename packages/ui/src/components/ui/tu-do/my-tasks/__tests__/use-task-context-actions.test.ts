import { act, renderHook } from '@testing-library/react';
import type { TaskWithRelations } from '@tuturuuu/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskContextActions } from '../use-task-context-actions';

// Hoisted mocks — vi.hoisted() makes these available at vi.mock() hoist time
const {
  mockAddWorkspaceTaskLabel,
  mockDeleteWorkspaceTask,
  mockInvalidateQueries,
  mockListWorkspaceTaskLists,
  mockRemoveWorkspaceTaskLabel,
  mockSetQueriesData,
  mockT,
  mockToastError,
  mockUpdateWorkspaceTask,
} = vi.hoisted(() => ({
  mockAddWorkspaceTaskLabel: vi.fn(),
  mockDeleteWorkspaceTask: vi.fn(),
  mockInvalidateQueries: vi.fn(),
  mockListWorkspaceTaskLists: vi.fn(),
  mockRemoveWorkspaceTaskLabel: vi.fn(),
  mockSetQueriesData: vi.fn(),
  mockT: vi.fn((key: string) => key),
  mockToastError: vi.fn(),
  mockUpdateWorkspaceTask: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
    setQueriesData: mockSetQueriesData,
  }),
}));

vi.mock('@tuturuuu/supabase/next/client', () => ({
  createClient: () => ({ from: vi.fn() }),
}));

vi.mock('@tuturuuu/internal-api', () => ({
  addWorkspaceTaskLabel: mockAddWorkspaceTaskLabel,
  deleteWorkspaceTask: mockDeleteWorkspaceTask,
  listWorkspaceTaskLists: mockListWorkspaceTaskLists,
  removeWorkspaceTaskLabel: mockRemoveWorkspaceTaskLabel,
  updateWorkspaceTask: mockUpdateWorkspaceTask,
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
    mockAddWorkspaceTaskLabel.mockResolvedValue({ taskLabel: null });
    mockDeleteWorkspaceTask.mockResolvedValue({ success: true });
    mockListWorkspaceTaskLists.mockResolvedValue({
      lists: [
        { id: 'list-1', status: 'active' },
        { id: 'list-2', status: 'done' },
      ],
    });
    mockRemoveWorkspaceTaskLabel.mockResolvedValue({ success: true });
    mockUpdateWorkspaceTask.mockResolvedValue({ task: null });
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

    await act(async () => {
      await result.current.handleDoneWithMyPart();
    });

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

    await act(async () => {
      await result.current.handleUndoDoneWithMyPart();
    });

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

    await act(async () => {
      await result.current.handleComplete();
    });

    expect(mockListWorkspaceTaskLists).toHaveBeenCalledWith('ws-1', 'board-1');
    expect(mockUpdateWorkspaceTask).toHaveBeenCalledWith('ws-1', 'task-123', {
      list_id: 'list-2',
    });

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

    mockListWorkspaceTaskLists.mockResolvedValueOnce({
      lists: [{ id: 'list-done', status: 'done' }],
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

    await act(async () => {
      await result.current.handleComplete();
    });

    expect(global.fetch).toHaveBeenCalled();
    expect(onTaskUpdate).toHaveBeenCalled();
  });

  it('handleDelete deletes the task via internal API', async () => {
    const { result } = renderHook(() =>
      useTaskContextActions({
        task: mockTask,
        userId,
        onTaskUpdate,
        onClose,
      })
    );

    await act(async () => {
      await result.current.handleDelete();
    });

    expect(mockDeleteWorkspaceTask).toHaveBeenCalledWith('ws-1', mockTask.id);
    expect(onTaskUpdate).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('handlePriorityChange updates task priority via internal API', async () => {
    const { result } = renderHook(() =>
      useTaskContextActions({
        task: mockTask,
        userId,
        onTaskUpdate,
        onClose,
      })
    );

    await act(async () => {
      await result.current.handlePriorityChange('high');
    });

    expect(mockUpdateWorkspaceTask).toHaveBeenCalledWith('ws-1', mockTask.id, {
      priority: 'high',
    });
    expect(mockInvalidateQueries).toHaveBeenCalled();
  });

  it('handleUnassignMe updates assignee_ids via internal API', async () => {
    const { result } = renderHook(() =>
      useTaskContextActions({
        task: mockTask,
        userId,
        onTaskUpdate,
        onClose,
      })
    );

    await act(async () => {
      await result.current.handleUnassignMe();
    });

    expect(mockUpdateWorkspaceTask).toHaveBeenCalledWith('ws-1', mockTask.id, {
      assignee_ids: [],
    });
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

    await act(async () => {
      await result.current.handleDoneWithMyPart();
    });

    expect(mockToastError).toHaveBeenCalledWith('failed_to_update');
    expect(onTaskUpdate).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('handles error in handleDelete', async () => {
    mockDeleteWorkspaceTask.mockRejectedValueOnce(new Error('Database error'));

    const { result } = renderHook(() =>
      useTaskContextActions({
        task: mockTask,
        userId,
        onTaskUpdate,
        onClose,
      })
    );

    await act(async () => {
      await result.current.handleDelete();
    });

    expect(mockToastError).toHaveBeenCalledWith('failed_to_update');
    expect(onTaskUpdate).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('handles error in handlePriorityChange', async () => {
    mockUpdateWorkspaceTask.mockRejectedValueOnce(new Error('Update failed'));

    const { result } = renderHook(() =>
      useTaskContextActions({
        task: mockTask,
        userId,
        onTaskUpdate,
        onClose,
      })
    );

    await act(async () => {
      await result.current.handlePriorityChange('low');
    });

    expect(mockToastError).toHaveBeenCalledWith('failed_to_update');
    expect(mockInvalidateQueries).toHaveBeenCalled();
  });

  it('optimistically updates cache when calling handleUnassignMe', async () => {
    const { result } = renderHook(() =>
      useTaskContextActions({
        task: mockTask,
        userId,
        onTaskUpdate,
        onClose,
      })
    );

    await act(async () => {
      await result.current.handleUnassignMe();
    });

    expect(mockSetQueriesData).toHaveBeenCalled();
    const setQueriesDataCall = mockSetQueriesData.mock.calls[0]!;
    expect(setQueriesDataCall[0]).toEqual({ queryKey: ['my-tasks'] });
  });

  it('handleDueDateChange updates end_date correctly', async () => {
    const { result } = renderHook(() =>
      useTaskContextActions({
        task: mockTask,
        userId,
        onTaskUpdate,
        onClose,
      })
    );

    await act(async () => {
      await result.current.handleDueDateChange(7);
    });

    expect(mockUpdateWorkspaceTask).toHaveBeenCalledWith(
      'ws-1',
      mockTask.id,
      expect.objectContaining({
        end_date: expect.any(String),
      })
    );
    expect(mockInvalidateQueries).toHaveBeenCalled();
  });

  it('handleToggleLabel adds label when not present', async () => {
    const { result } = renderHook(() =>
      useTaskContextActions({
        task: mockTask,
        userId,
        onTaskUpdate,
        onClose,
      })
    );

    await act(async () => {
      await result.current.handleToggleLabel('label-1');
    });

    expect(mockAddWorkspaceTaskLabel).toHaveBeenCalledWith(
      'ws-1',
      mockTask.id,
      'label-1'
    );
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

    const { result } = renderHook(() =>
      useTaskContextActions({
        task: taskWithLabel,
        userId,
        onTaskUpdate,
        onClose,
      })
    );

    await act(async () => {
      await result.current.handleToggleLabel('label-1');
    });

    expect(mockRemoveWorkspaceTaskLabel).toHaveBeenCalledWith(
      'ws-1',
      taskWithLabel.id,
      'label-1'
    );
    expect(mockInvalidateQueries).toHaveBeenCalled();
  });

  it('handleUndoComplete moves task back to active list', async () => {
    mockListWorkspaceTaskLists.mockResolvedValueOnce({
      lists: [
        { id: 'list-active', status: 'active' },
        { id: 'list-done', status: 'done' },
      ],
    });

    const { result } = renderHook(() =>
      useTaskContextActions({
        task: mockTask,
        userId,
        onTaskUpdate,
        onClose,
      })
    );

    await act(async () => {
      await result.current.handleUndoComplete();
    });

    expect(mockListWorkspaceTaskLists).toHaveBeenCalledWith('ws-1', 'board-1');
    expect(mockUpdateWorkspaceTask).toHaveBeenCalledWith('ws-1', mockTask.id, {
      list_id: 'list-active',
    });
    expect(onTaskUpdate).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
