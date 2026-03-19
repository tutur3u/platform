/**
 * @vitest-environment jsdom
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskActions } from '../use-task-actions';

// Mock dependencies
vi.mock('@tuturuuu/supabase/next/client', () => ({
  createClient: vi.fn(),
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@tuturuuu/internal-api/tasks', () => ({
  updateWorkspaceTask: vi.fn(() => Promise.resolve({ task: { id: 'task-1' } })),
  resolveTaskProjectWorkspaceId: vi.fn(() => Promise.resolve('resolved-ws')),
}));

vi.mock('@tuturuuu/utils/task-helper', () => ({
  useUpdateTask: vi.fn(),
}));

describe('useTaskActions', () => {
  let queryClient: QueryClient;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockSupabase: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockUpdateWorkspaceTask: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockResolveTaskProjectWorkspaceId: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockUpdateTaskMutation: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockToast: any;

  const mockTask = {
    id: 'task-1',
    name: 'Test Task',
    ws_id: 'ws-1',
    list_id: 'list-1',
    created_at: '2025-01-01T00:00:00Z',
    closed_at: null,
    completed_at: null,
    assignees: [],
    labels: [],
    projects: [],
    priority: null,
    estimation_points: null,
    end_date: null,
    display_number: 1,
  } as unknown as Task;

  const mockCompletionList: TaskList = {
    id: 'completion-list',
    name: 'Done',
    board_id: 'board-1',
    status: 'done',
    created_at: '2025-01-01T00:00:00Z',
  } as TaskList;

  const mockClosedList: TaskList = {
    id: 'closed-list',
    name: 'Closed',
    board_id: 'board-1',
    status: 'closed',
    created_at: '2025-01-01T00:00:00Z',
  } as TaskList;

  const mockAvailableLists = [
    {
      id: 'list-1',
      name: 'To Do',
      board_id: 'board-1',
      status: 'open',
      created_at: '2025-01-01T00:00:00Z',
      archived: false,
      deleted: false,
      creator_id: 'user-1',
      color: null,
      position: 0,
    } as unknown as TaskList,
    mockCompletionList,
    mockClosedList,
  ];

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(async () => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    // Setup mock Supabase client with consistent chaining
    mockSupabase = {
      from: vi.fn(() => mockSupabase),
      update: vi.fn(() => mockSupabase),
      delete: vi.fn(() => mockSupabase),
      insert: vi.fn(() => mockSupabase),
      select: vi.fn(() => mockSupabase),
      eq: vi.fn(() => mockSupabase),
      in: vi.fn(() => mockSupabase),
    };

    const { createClient } = await import('@tuturuuu/supabase/next/client');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (createClient as any).mockReturnValue(mockSupabase);

    const { useUpdateTask } = await import('@tuturuuu/utils/task-helper');
    const { updateWorkspaceTask } = await import(
      '@tuturuuu/internal-api/tasks'
    );
    const { resolveTaskProjectWorkspaceId } = await import(
      '@tuturuuu/internal-api/tasks'
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockUpdateWorkspaceTask = updateWorkspaceTask as any;
    mockUpdateWorkspaceTask.mockResolvedValue({ task: { id: 'task-1' } });
    mockResolveTaskProjectWorkspaceId = resolveTaskProjectWorkspaceId as any;
    mockResolveTaskProjectWorkspaceId.mockResolvedValue('resolved-ws');

    mockUpdateTaskMutation = {
      mutate: vi.fn(),
      mutateAsync: vi.fn().mockResolvedValue(undefined),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (useUpdateTask as any).mockReturnValue(mockUpdateTaskMutation);

    const { toast } = await import('@tuturuuu/ui/sonner');
    mockToast = toast;

    vi.clearAllMocks();
  });

  describe('handleArchiveToggle', () => {
    it('should toggle task to archived state and move to completion list', async () => {
      queryClient.setQueryData(['tasks', 'board-1'], [mockTask]);

      const onUpdate = vi.fn();
      const setIsLoading = vi.fn();

      const { result } = renderHook(
        () =>
          useTaskActions({
            task: mockTask,
            boardId: 'board-1',
            targetCompletionList: mockCompletionList,
            targetClosedList: mockClosedList,
            availableLists: mockAvailableLists,
            onUpdate,
            setIsLoading,
            setMenuOpen: vi.fn(),
          }),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleArchiveToggle();
      });

      expect(setIsLoading).toHaveBeenCalledWith(true);
      expect(mockUpdateWorkspaceTask).toHaveBeenCalledWith('ws-1', 'task-1', {
        list_id: 'completion-list',
      });
      expect(mockToast.success).toHaveBeenCalledWith('Task completed', {
        description: 'Task marked as done and moved to Done',
      });
    });

    it('should handle simple toggle without moving list', async () => {
      const taskInCompletionList = {
        ...mockTask,
        list_id: 'completion-list',
      };
      queryClient.setQueryData(['tasks', 'board-1'], [taskInCompletionList]);

      const onUpdate = vi.fn();
      const setIsLoading = vi.fn();

      const { result } = renderHook(
        () =>
          useTaskActions({
            task: taskInCompletionList,
            boardId: 'board-1',
            targetCompletionList: mockCompletionList,
            targetClosedList: mockClosedList,
            availableLists: mockAvailableLists,
            onUpdate,
            setIsLoading,
            setMenuOpen: vi.fn(),
          }),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleArchiveToggle();
      });

      expect(mockUpdateWorkspaceTask).toHaveBeenCalledWith('ws-1', 'task-1', {
        closed_at: expect.any(String),
      });
    });

    it('prefers task.ws_id over a fallback workspace prop when archiving', async () => {
      queryClient.setQueryData(['tasks', 'board-1'], [mockTask]);

      const { result } = renderHook(
        () =>
          useTaskActions({
            task: mockTask,
            boardId: 'board-1',
            workspaceId: '00000000-0000-0000-0000-000000000000',
            targetCompletionList: mockCompletionList,
            targetClosedList: mockClosedList,
            availableLists: mockAvailableLists,
            onUpdate: vi.fn(),
            setIsLoading: vi.fn(),
            setMenuOpen: vi.fn(),
          }),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleArchiveToggle();
      });

      expect(mockUpdateWorkspaceTask).toHaveBeenCalledWith('ws-1', 'task-1', {
        list_id: 'completion-list',
      });
    });

    it('falls back to nested task list workspace metadata before a bad workspace prop', async () => {
      queryClient.setQueryData(
        ['tasks', 'board-1'],
        [
          {
            ...mockTask,
            ws_id: undefined,
            task_lists: {
              workspace_boards: {
                ws_id: 'ws-from-list',
              },
            },
          },
        ]
      );

      const nestedWorkspaceTask = {
        ...mockTask,
        ws_id: undefined,
        task_lists: {
          workspace_boards: {
            ws_id: 'ws-from-list',
          },
        },
      } as Task;

      const { result } = renderHook(
        () =>
          useTaskActions({
            task: nestedWorkspaceTask,
            boardId: 'board-1',
            workspaceId: '00000000-0000-0000-0000-000000000000',
            targetCompletionList: mockCompletionList,
            targetClosedList: mockClosedList,
            availableLists: mockAvailableLists,
            onUpdate: vi.fn(),
            setIsLoading: vi.fn(),
            setMenuOpen: vi.fn(),
          }),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleArchiveToggle();
      });

      expect(mockUpdateWorkspaceTask).toHaveBeenCalledWith(
        'ws-from-list',
        'task-1',
        {
          list_id: 'completion-list',
        }
      );
    });

    it('resolves the board workspace before using a bad workspace prop', async () => {
      queryClient.setQueryData(
        ['tasks', 'board-1'],
        [
          {
            ...mockTask,
            ws_id: undefined,
            task_lists: undefined,
          },
        ]
      );

      const boardOnlyTask = {
        ...mockTask,
        ws_id: undefined,
        task_lists: undefined,
      } as Task;

      mockResolveTaskProjectWorkspaceId.mockResolvedValueOnce(
        'resolved-from-board'
      );

      const { result } = renderHook(
        () =>
          useTaskActions({
            task: boardOnlyTask,
            boardId: 'board-1',
            workspaceId: '00000000-0000-0000-0000-000000000000',
            targetCompletionList: mockCompletionList,
            targetClosedList: mockClosedList,
            availableLists: mockAvailableLists,
            onUpdate: vi.fn(),
            setIsLoading: vi.fn(),
            setMenuOpen: vi.fn(),
          }),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleArchiveToggle();
      });

      expect(mockResolveTaskProjectWorkspaceId).toHaveBeenCalledWith({
        boardId: 'board-1',
      });
      expect(mockUpdateWorkspaceTask).toHaveBeenCalledWith(
        'resolved-from-board',
        'task-1',
        {
          list_id: 'completion-list',
        }
      );
    });

    it('should rollback on error', async () => {
      queryClient.setQueryData(['tasks', 'board-1'], [mockTask]);
      mockUpdateWorkspaceTask.mockRejectedValueOnce(new Error('Network error'));

      const onUpdate = vi.fn();
      const setIsLoading = vi.fn();

      const { result } = renderHook(
        () =>
          useTaskActions({
            task: mockTask,
            boardId: 'board-1',
            targetCompletionList: mockCompletionList,
            targetClosedList: mockClosedList,
            availableLists: mockAvailableLists,
            onUpdate,
            setIsLoading,
            setMenuOpen: vi.fn(),
          }),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleArchiveToggle();
      });

      expect(mockToast.error).toHaveBeenCalledWith('Error', {
        description: 'Failed to complete task. Please try again.',
      });
      const cachedTasks = queryClient.getQueryData<Task[]>([
        'tasks',
        'board-1',
      ]);
      expect(cachedTasks).toEqual([mockTask]);
    });
  });

  describe('handleMoveToCompletion', () => {
    it('should move single task to completion list', async () => {
      queryClient.setQueryData(['tasks', 'board-1'], [mockTask]);

      const onUpdate = vi.fn();
      const setIsLoading = vi.fn();
      const setMenuOpen = vi.fn();

      const { result } = renderHook(
        () =>
          useTaskActions({
            task: mockTask,
            boardId: 'board-1',
            targetCompletionList: mockCompletionList,
            targetClosedList: mockClosedList,
            availableLists: mockAvailableLists,
            onUpdate,
            setIsLoading,
            setMenuOpen,
          }),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleMoveToCompletion();
      });

      expect(mockUpdateWorkspaceTask).toHaveBeenCalledWith('ws-1', 'task-1', {
        list_id: 'completion-list',
      });
      expect(mockToast.success).toHaveBeenCalledWith('Task completed', {
        description: 'Task marked as done and moved to Done',
      });
      expect(setMenuOpen).toHaveBeenCalledWith(false);
    });

    it('should handle bulk move of multiple tasks', async () => {
      const task2: Task = { ...mockTask, id: 'task-2', name: 'Task 2' };
      queryClient.setQueryData(['tasks', 'board-1'], [mockTask, task2]);

      const selectedTasks = new Set(['task-1', 'task-2']);
      const onUpdate = vi.fn();
      const setIsLoading = vi.fn();
      const setMenuOpen = vi.fn();

      const { result } = renderHook(
        () =>
          useTaskActions({
            task: mockTask,
            boardId: 'board-1',
            targetCompletionList: mockCompletionList,
            targetClosedList: mockClosedList,
            availableLists: mockAvailableLists,
            onUpdate,
            setIsLoading,
            setMenuOpen,
            selectedTasks,
            isMultiSelectMode: true,
          }),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleMoveToCompletion();
      });

      expect(mockUpdateWorkspaceTask).toHaveBeenCalledTimes(2);
      expect(mockToast.success).toHaveBeenCalledWith('2 tasks completed', {
        description: 'Tasks marked as done',
      });
    });
  });

  describe('handleMoveToClose', () => {
    it('should move single task to closed list', async () => {
      queryClient.setQueryData(['tasks', 'board-1'], [mockTask]);

      const onUpdate = vi.fn();
      const setIsLoading = vi.fn();
      const setMenuOpen = vi.fn();

      const { result } = renderHook(
        () =>
          useTaskActions({
            task: mockTask,
            boardId: 'board-1',
            targetCompletionList: mockCompletionList,
            targetClosedList: mockClosedList,
            availableLists: mockAvailableLists,
            onUpdate,
            setIsLoading,
            setMenuOpen,
          }),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleMoveToClose();
      });

      expect(mockUpdateWorkspaceTask).toHaveBeenCalledWith('ws-1', 'task-1', {
        list_id: 'closed-list',
      });
      expect(mockToast.success).toHaveBeenCalledWith('Success', {
        description: 'Task marked as closed',
      });
      expect(setMenuOpen).toHaveBeenCalledWith(false);
    });

    it('should handle bulk close of multiple tasks', async () => {
      const task2: Task = { ...mockTask, id: 'task-2', name: 'Task 2' };
      queryClient.setQueryData(['tasks', 'board-1'], [mockTask, task2]);

      const selectedTasks = new Set(['task-1', 'task-2']);
      const onUpdate = vi.fn();
      const setIsLoading = vi.fn();
      const setMenuOpen = vi.fn();

      const { result } = renderHook(
        () =>
          useTaskActions({
            task: mockTask,
            boardId: 'board-1',
            targetCompletionList: mockCompletionList,
            targetClosedList: mockClosedList,
            availableLists: mockAvailableLists,
            onUpdate,
            setIsLoading,
            setMenuOpen,
            selectedTasks,
            isMultiSelectMode: true,
          }),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleMoveToClose();
      });

      expect(mockUpdateWorkspaceTask).toHaveBeenCalledTimes(2);
      expect(mockToast.success).toHaveBeenCalledWith('Success', {
        description: '2 tasks marked as closed',
      });
    });
  });

  describe('handleDelete', () => {
    it('should soft delete single task', async () => {
      queryClient.setQueryData(['tasks', 'board-1'], [mockTask]);
      // Configure the .eq() call to resolve to a success response
      mockSupabase.eq = vi.fn(() =>
        Promise.resolve({ error: null, data: [], count: 1 })
      );

      const setIsLoading = vi.fn();
      const setDeleteDialogOpen = vi.fn();

      const { result } = renderHook(
        () =>
          useTaskActions({
            task: mockTask,
            boardId: 'board-1',
            targetCompletionList: mockCompletionList,
            targetClosedList: mockClosedList,
            availableLists: mockAvailableLists,
            onUpdate: vi.fn(),
            setIsLoading,
            setMenuOpen: vi.fn(),
            setDeleteDialogOpen,
          }),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleDelete();
      });

      expect(mockUpdateWorkspaceTask).toHaveBeenCalledWith('ws-1', 'task-1', {
        deleted: true,
      });
      expect(mockToast.success).toHaveBeenCalledWith('Success', {
        description: 'Task deleted successfully',
      });
      expect(setDeleteDialogOpen).toHaveBeenCalledWith(false);

      const deletedTasks = queryClient.getQueryData<Task[]>([
        'deleted-tasks',
        'board-1',
      ]);
      expect(deletedTasks?.[0]).toMatchObject({ id: 'task-1' });
      expect(deletedTasks?.[0]?.deleted_at).toEqual(expect.any(String));
    });

    it('should handle bulk delete of multiple tasks', async () => {
      const task2: Task = { ...mockTask, id: 'task-2', name: 'Task 2' };
      queryClient.setQueryData(['tasks', 'board-1'], [mockTask, task2]);
      // Configure the .eq() call to resolve to a success response (sequential deletion)
      mockSupabase.eq = vi.fn(() =>
        Promise.resolve({ error: null, data: [], count: 1 })
      );

      const selectedTasks = new Set(['task-1', 'task-2']);
      const setIsLoading = vi.fn();
      const setDeleteDialogOpen = vi.fn();

      const { result } = renderHook(
        () =>
          useTaskActions({
            task: mockTask,
            boardId: 'board-1',
            targetCompletionList: mockCompletionList,
            targetClosedList: mockClosedList,
            availableLists: mockAvailableLists,
            onUpdate: vi.fn(),
            setIsLoading,
            setMenuOpen: vi.fn(),
            setDeleteDialogOpen,
            selectedTasks,
            isMultiSelectMode: true,
          }),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleDelete();
      });

      expect(mockUpdateWorkspaceTask).toHaveBeenCalledTimes(2);
      expect(mockToast.success).toHaveBeenCalledWith('Success', {
        description: '2 tasks deleted',
      });

      const deletedTasks = queryClient.getQueryData<Task[]>([
        'deleted-tasks',
        'board-1',
      ]);
      expect(deletedTasks?.map((t) => t.id)).toEqual(
        expect.arrayContaining(['task-1', 'task-2'])
      );
    });
  });

  describe('handleDueDateChange', () => {
    it('should update due date for single task', async () => {
      queryClient.setQueryData(['tasks', 'board-1'], [mockTask]);

      const setIsLoading = vi.fn();

      const { result } = renderHook(
        () =>
          useTaskActions({
            task: mockTask,
            boardId: 'board-1',
            targetCompletionList: mockCompletionList,
            targetClosedList: mockClosedList,
            availableLists: mockAvailableLists,
            onUpdate: vi.fn(),
            setIsLoading,
            setMenuOpen: vi.fn(),
          }),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleDueDateChange(7); // 7 days from now
      });

      expect(mockUpdateWorkspaceTask).toHaveBeenCalledWith('ws-1', 'task-1', {
        end_date: expect.any(String),
      });
      expect(mockToast.success).toHaveBeenCalledWith('Due date updated', {
        description: 'Due date set successfully',
      });
    });

    it('should handle bulk due date update', async () => {
      const task2: Task = { ...mockTask, id: 'task-2', name: 'Task 2' };
      queryClient.setQueryData(['tasks', 'board-1'], [mockTask, task2]);
      // Configure the .eq() call to resolve to a success response (sequential update)
      mockSupabase.eq = vi.fn(() =>
        Promise.resolve({ error: null, data: [], count: 1 })
      );

      const selectedTasks = new Set(['task-1', 'task-2']);
      const setIsLoading = vi.fn();

      const { result } = renderHook(
        () =>
          useTaskActions({
            task: mockTask,
            boardId: 'board-1',
            targetCompletionList: mockCompletionList,
            targetClosedList: mockClosedList,
            availableLists: mockAvailableLists,
            onUpdate: vi.fn(),
            setIsLoading,
            setMenuOpen: vi.fn(),
            selectedTasks,
            isMultiSelectMode: true,
          }),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleDueDateChange(7);
      });

      // Implementation uses sequential updateWorkspaceTask calls per task
      expect(mockUpdateWorkspaceTask).toHaveBeenCalledTimes(2);
      expect(mockUpdateWorkspaceTask).toHaveBeenCalledWith('ws-1', 'task-1', {
        end_date: expect.any(String),
      });
    });

    it('should remove due date when null is passed', async () => {
      queryClient.setQueryData(['tasks', 'board-1'], [mockTask]);

      const setIsLoading = vi.fn();

      const { result } = renderHook(
        () =>
          useTaskActions({
            task: mockTask,
            boardId: 'board-1',
            targetCompletionList: mockCompletionList,
            targetClosedList: mockClosedList,
            availableLists: mockAvailableLists,
            onUpdate: vi.fn(),
            setIsLoading,
            setMenuOpen: vi.fn(),
          }),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleDueDateChange(null);
      });

      expect(mockUpdateWorkspaceTask).toHaveBeenCalledWith('ws-1', 'task-1', {
        end_date: null,
      });
    });
  });

  describe('handlePriorityChange', () => {
    it('should update priority for single task', async () => {
      queryClient.setQueryData(['tasks', 'board-1'], [mockTask]);

      const setIsLoading = vi.fn();

      const { result } = renderHook(
        () =>
          useTaskActions({
            task: mockTask,
            boardId: 'board-1',
            targetCompletionList: mockCompletionList,
            targetClosedList: mockClosedList,
            availableLists: mockAvailableLists,
            onUpdate: vi.fn(),
            setIsLoading,
            setMenuOpen: vi.fn(),
          }),
        { wrapper }
      );

      await act(async () => {
        await result.current.handlePriorityChange('high');
      });

      expect(mockUpdateWorkspaceTask).toHaveBeenCalledWith('ws-1', 'task-1', {
        priority: 'high',
      });
      expect(mockToast.success).toHaveBeenCalledWith('Priority updated', {
        description: 'Priority changed',
      });
    });

    it('should handle bulk priority update', async () => {
      const task2: Task = { ...mockTask, id: 'task-2', name: 'Task 2' };
      queryClient.setQueryData(['tasks', 'board-1'], [mockTask, task2]);
      // Configure the .eq() call to resolve to a success response (sequential update)
      mockSupabase.eq = vi.fn(() =>
        Promise.resolve({ error: null, data: [], count: 1 })
      );

      const selectedTasks = new Set(['task-1', 'task-2']);
      const setIsLoading = vi.fn();

      const { result } = renderHook(
        () =>
          useTaskActions({
            task: mockTask,
            boardId: 'board-1',
            targetCompletionList: mockCompletionList,
            targetClosedList: mockClosedList,
            availableLists: mockAvailableLists,
            onUpdate: vi.fn(),
            setIsLoading,
            setMenuOpen: vi.fn(),
            selectedTasks,
            isMultiSelectMode: true,
          }),
        { wrapper }
      );

      await act(async () => {
        await result.current.handlePriorityChange('high');
      });

      // Implementation uses sequential updateWorkspaceTask calls per task
      expect(mockUpdateWorkspaceTask).toHaveBeenCalledTimes(2);
      expect(mockUpdateWorkspaceTask).toHaveBeenCalledWith('ws-1', 'task-1', {
        priority: 'high',
      });
    });
  });

  describe('updateEstimationPoints', () => {
    it('should update estimation points for single task', async () => {
      queryClient.setQueryData(['tasks', 'board-1'], [mockTask]);

      const setEstimationSaving = vi.fn();

      const { result } = renderHook(
        () =>
          useTaskActions({
            task: mockTask,
            boardId: 'board-1',
            targetCompletionList: mockCompletionList,
            targetClosedList: mockClosedList,
            availableLists: mockAvailableLists,
            onUpdate: vi.fn(),
            setIsLoading: vi.fn(),
            setMenuOpen: vi.fn(),
            setEstimationSaving,
          }),
        { wrapper }
      );

      await act(async () => {
        await result.current.updateEstimationPoints(5);
      });

      expect(mockUpdateWorkspaceTask).toHaveBeenCalledWith('ws-1', 'task-1', {
        estimation_points: 5,
      });
      expect(mockToast.success).toHaveBeenCalledWith('Estimation updated', {
        description: 'Estimation points updated successfully',
      });
    });

    it('should skip update if estimation points already match', async () => {
      const taskWithEstimation = { ...mockTask, estimation_points: 5 };
      queryClient.setQueryData(['tasks', 'board-1'], [taskWithEstimation]);

      const setEstimationSaving = vi.fn();

      const { result } = renderHook(
        () =>
          useTaskActions({
            task: taskWithEstimation,
            boardId: 'board-1',
            targetCompletionList: mockCompletionList,
            targetClosedList: mockClosedList,
            availableLists: mockAvailableLists,
            onUpdate: vi.fn(),
            setIsLoading: vi.fn(),
            setMenuOpen: vi.fn(),
            setEstimationSaving,
          }),
        { wrapper }
      );

      await act(async () => {
        await result.current.updateEstimationPoints(5);
      });

      expect(mockUpdateTaskMutation.mutateAsync).not.toHaveBeenCalled();
      expect(setEstimationSaving).not.toHaveBeenCalled();
    });

    it('should handle bulk estimation update', async () => {
      const task2: Task = { ...mockTask, id: 'task-2', name: 'Task 2' };
      queryClient.setQueryData(['tasks', 'board-1'], [mockTask, task2]);
      // Configure the .eq() call to resolve to a success response (sequential update)
      mockSupabase.eq = vi.fn(() =>
        Promise.resolve({ error: null, data: [], count: 1 })
      );

      const selectedTasks = new Set(['task-1', 'task-2']);
      const setEstimationSaving = vi.fn();

      const { result } = renderHook(
        () =>
          useTaskActions({
            task: mockTask,
            boardId: 'board-1',
            targetCompletionList: mockCompletionList,
            targetClosedList: mockClosedList,
            availableLists: mockAvailableLists,
            onUpdate: vi.fn(),
            setIsLoading: vi.fn(),
            setMenuOpen: vi.fn(),
            setEstimationSaving,
            selectedTasks,
            isMultiSelectMode: true,
          }),
        { wrapper }
      );

      await act(async () => {
        await result.current.updateEstimationPoints(8);
      });

      // Implementation uses sequential updateWorkspaceTask calls per task
      expect(mockUpdateWorkspaceTask).toHaveBeenCalledTimes(2);
      expect(mockUpdateWorkspaceTask).toHaveBeenCalledWith('ws-1', 'task-1', {
        estimation_points: 8,
      });
    });

    it('should rollback estimation points on update failure', async () => {
      const taskWithEstimation = { ...mockTask, estimation_points: 3 };
      queryClient.setQueryData(['tasks', 'board-1'], [taskWithEstimation]);

      // Mock the API call to fail
      mockUpdateWorkspaceTask.mockRejectedValueOnce(
        new Error('Database connection failed')
      );

      const setEstimationSaving = vi.fn();

      const { result } = renderHook(
        () =>
          useTaskActions({
            task: taskWithEstimation,
            boardId: 'board-1',
            targetCompletionList: mockCompletionList,
            targetClosedList: mockClosedList,
            availableLists: mockAvailableLists,
            onUpdate: vi.fn(),
            setIsLoading: vi.fn(),
            setMenuOpen: vi.fn(),
            setEstimationSaving,
          }),
        { wrapper }
      );

      await act(async () => {
        await result.current.updateEstimationPoints(8);
      });

      // Verify the cache was rolled back to original value
      await waitFor(() => {
        const cachedTasks = queryClient.getQueryData<Task[]>([
          'tasks',
          'board-1',
        ]);
        expect(cachedTasks).toBeDefined();
        expect(cachedTasks?.[0]?.estimation_points).toBe(3);
      });

      // Verify error toast was shown
      expect(mockToast.error).toHaveBeenCalledWith(
        'Failed to update estimation',
        {
          description: 'Failed to update any tasks',
        }
      );

      // Verify loading states were called correctly
      expect(setEstimationSaving).toHaveBeenCalledWith(true);
      expect(setEstimationSaving).toHaveBeenCalledWith(false);
    });
  });

  describe('handleCustomDateChange', () => {
    it('should update task end_date and close dialog', async () => {
      queryClient.setQueryData(['tasks', 'board-1'], [mockTask]);

      const setIsLoading = vi.fn();
      const setCustomDateDialogOpen = vi.fn();

      const { result } = renderHook(
        () =>
          useTaskActions({
            task: mockTask,
            boardId: 'board-1',
            targetCompletionList: mockCompletionList,
            targetClosedList: mockClosedList,
            availableLists: mockAvailableLists,
            onUpdate: vi.fn(),
            setIsLoading,
            setMenuOpen: vi.fn(),
            setCustomDateDialogOpen,
          }),
        { wrapper }
      );

      const testDate = new Date('2024-01-01T00:00:00');

      await act(async () => {
        await result.current.handleCustomDateChange(testDate);
      });

      expect(setCustomDateDialogOpen).toHaveBeenCalledWith(false);
      expect(mockUpdateWorkspaceTask).toHaveBeenCalledWith('ws-1', 'task-1', {
        end_date: expect.any(String),
      });
    });
  });

  describe('handleToggleAssignee', () => {
    it('should add assignee to task', async () => {
      const taskNoWorkspace = {
        ...mockTask,
        ws_id: undefined,
      } as unknown as Task;

      queryClient.setQueryData(['tasks', 'board-1'], [taskNoWorkspace]);

      const setIsLoading = vi.fn();

      const { result } = renderHook(
        () =>
          useTaskActions({
            task: taskNoWorkspace,
            boardId: 'board-1',
            workspaceId: 'ws-1',
            targetCompletionList: mockCompletionList,
            targetClosedList: mockClosedList,
            availableLists: mockAvailableLists,
            onUpdate: vi.fn(),
            setIsLoading,
            setMenuOpen: vi.fn(),
          }),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleToggleAssignee('user-1');
      });

      await waitFor(() => {
        expect(mockUpdateWorkspaceTask).toHaveBeenCalledWith(
          'resolved-ws',
          'task-1',
          {
            assignee_ids: ['user-1'],
          }
        );
      });
    });

    it('should remove assignee from task', async () => {
      const taskWithAssignee = {
        ...mockTask,
        ws_id: undefined,
        assignees: [
          { id: 'user-1', display_name: 'User 1', email: 'user1@test.com' },
        ],
      } as unknown as Task;
      queryClient.setQueryData(['tasks', 'board-1'], [taskWithAssignee]);

      const setIsLoading = vi.fn();

      const { result } = renderHook(
        () =>
          useTaskActions({
            task: taskWithAssignee,
            boardId: 'board-1',
            workspaceId: 'ws-1',
            targetCompletionList: mockCompletionList,
            targetClosedList: mockClosedList,
            availableLists: mockAvailableLists,
            onUpdate: vi.fn(),
            setIsLoading,
            setMenuOpen: vi.fn(),
          }),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleToggleAssignee('user-1');
      });

      await waitFor(() => {
        expect(mockUpdateWorkspaceTask).toHaveBeenCalledWith(
          'resolved-ws',
          'task-1',
          {
            assignee_ids: [],
          }
        );
      });
    });

    it('should rollback on error when adding assignee fails', async () => {
      const taskNoWorkspace = {
        ...mockTask,
        ws_id: undefined,
      } as unknown as Task;
      queryClient.setQueryData(['tasks', 'board-1'], [taskNoWorkspace]);

      mockUpdateWorkspaceTask.mockRejectedValueOnce(
        new Error('Database write failed')
      );

      const setIsLoading = vi.fn();
      const setMenuOpen = vi.fn();
      const onUpdate = vi.fn();

      const { result } = renderHook(
        () =>
          useTaskActions({
            task: taskNoWorkspace,
            boardId: 'board-1',
            workspaceId: 'ws-1',
            targetCompletionList: mockCompletionList,
            targetClosedList: mockClosedList,
            availableLists: mockAvailableLists,
            onUpdate,
            setIsLoading,
            setMenuOpen,
          }),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleToggleAssignee('user-1');
      });

      // Verify error toast was shown
      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Error', {
          description: 'Failed to update assignee. Please try again.',
        });
      });

      // Verify cache was rolled back to original state
      const cachedTasks = queryClient.getQueryData<Task[]>([
        'tasks',
        'board-1',
      ]);
      expect(cachedTasks).toEqual([taskNoWorkspace]);
      expect(cachedTasks?.[0]?.assignees).toEqual([]);

      // Verify loading state was managed correctly
      expect(setIsLoading).toHaveBeenCalledWith(true);
      expect(setIsLoading).toHaveBeenCalledWith(false);
    });

    it('should rollback on error when removing assignee fails', async () => {
      const taskWithAssignee = {
        ...mockTask,
        ws_id: undefined,
        assignees: [
          { id: 'user-1', display_name: 'User 1', email: 'user1@test.com' },
        ],
      } as unknown as Task;
      queryClient.setQueryData(['tasks', 'board-1'], [taskWithAssignee]);

      mockUpdateWorkspaceTask.mockRejectedValueOnce(
        new Error('Database delete failed')
      );

      const setIsLoading = vi.fn();
      const setMenuOpen = vi.fn();
      const onUpdate = vi.fn();

      const { result } = renderHook(
        () =>
          useTaskActions({
            task: taskWithAssignee,
            boardId: 'board-1',
            workspaceId: 'ws-1',
            targetCompletionList: mockCompletionList,
            targetClosedList: mockClosedList,
            availableLists: mockAvailableLists,
            onUpdate,
            setIsLoading,
            setMenuOpen,
          }),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleToggleAssignee('user-1');
      });

      // Verify error toast was shown
      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Error', {
          description: 'Failed to update assignee. Please try again.',
        });
      });

      // Verify cache was rolled back to original state with assignee still present
      const cachedTasks = queryClient.getQueryData<Task[]>([
        'tasks',
        'board-1',
      ]);
      expect(cachedTasks).toEqual([taskWithAssignee]);
      expect(cachedTasks?.[0]?.assignees).toHaveLength(1);
      expect(cachedTasks?.[0]?.assignees?.[0]?.id).toBe('user-1');

      // Verify loading state was managed correctly
      expect(setIsLoading).toHaveBeenCalledWith(true);
      expect(setIsLoading).toHaveBeenCalledWith(false);
    });
  });

  describe('handleMoveToList', () => {
    it('should move task to another list', async () => {
      queryClient.setQueryData(['tasks', 'board-1'], [mockTask]);

      const setIsLoading = vi.fn();
      const setMenuOpen = vi.fn();

      const { result } = renderHook(
        () =>
          useTaskActions({
            task: mockTask,
            boardId: 'board-1',
            targetCompletionList: mockCompletionList,
            targetClosedList: mockClosedList,
            availableLists: mockAvailableLists,
            onUpdate: vi.fn(),
            setIsLoading,
            setMenuOpen,
          }),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleMoveToList('list-2');
      });

      expect(mockUpdateWorkspaceTask).toHaveBeenCalledWith('ws-1', 'task-1', {
        list_id: 'list-2',
      });
      expect(setMenuOpen).toHaveBeenCalledWith(false);
    });

    it('should set loading when target list not found', async () => {
      queryClient.setQueryData(['tasks', 'board-1'], [mockTask]);
      const setIsLoading = vi.fn();

      const { result } = renderHook(
        () =>
          useTaskActions({
            task: mockTask,
            boardId: 'board-1',
            targetCompletionList: mockCompletionList,
            targetClosedList: mockClosedList,
            availableLists: mockAvailableLists,
            onUpdate: vi.fn(),
            setIsLoading,
            setMenuOpen: vi.fn(),
          }),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleMoveToList('new-list');
      });

      expect(setIsLoading).toHaveBeenCalledWith(true);
    });

    it('should skip move if target list is same as current', async () => {
      queryClient.setQueryData(['tasks', 'board-1'], [mockTask]);

      const setMenuOpen = vi.fn();

      const { result } = renderHook(
        () =>
          useTaskActions({
            task: mockTask,
            boardId: 'board-1',
            targetCompletionList: mockCompletionList,
            targetClosedList: mockClosedList,
            availableLists: mockAvailableLists,
            onUpdate: vi.fn(),
            setIsLoading: vi.fn(),
            setMenuOpen,
          }),
        { wrapper }
      );

      await act(async () => {
        await result.current.handleMoveToList('list-1');
      });

      expect(mockUpdateWorkspaceTask).not.toHaveBeenCalled();
      expect(setMenuOpen).toHaveBeenCalledWith(false);
    });
  });
});
