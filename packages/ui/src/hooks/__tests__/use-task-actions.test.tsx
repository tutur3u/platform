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

vi.mock('@tuturuuu/utils/task-helper', () => ({
  moveTask: vi.fn(),
  useUpdateTask: vi.fn(),
}));

describe('useTaskActions', () => {
  let queryClient: QueryClient;
  let mockSupabase: any;
  let mockMoveTask: any;
  let mockUpdateTaskMutation: any;
  let mockToast: any;

  const mockTask = {
    id: 'task-1',
    name: 'Test Task',
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
      select: vi.fn(() => mockSupabase),
      eq: vi.fn(() => mockSupabase),
      in: vi.fn(() => mockSupabase),
    };

    const { createClient } = await import('@tuturuuu/supabase/next/client');
    (createClient as any).mockReturnValue(mockSupabase);

    const { moveTask, useUpdateTask } = await import(
      '@tuturuuu/utils/task-helper'
    );
    mockMoveTask = moveTask as any;
    mockMoveTask.mockResolvedValue(undefined);

    mockUpdateTaskMutation = {
      mutate: vi.fn(),
      mutateAsync: vi.fn().mockResolvedValue(undefined),
    };
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
      expect(mockMoveTask).toHaveBeenCalledWith(
        mockSupabase,
        'task-1',
        'completion-list'
      );
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

      expect(mockUpdateTaskMutation.mutate).toHaveBeenCalled();
      expect(mockMoveTask).not.toHaveBeenCalled();
    });

    it('should rollback on error', async () => {
      queryClient.setQueryData(['tasks', 'board-1'], [mockTask]);
      mockMoveTask.mockRejectedValueOnce(new Error('Network error'));

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

      expect(mockMoveTask).toHaveBeenCalledWith(
        mockSupabase,
        'task-1',
        'completion-list'
      );
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

      expect(mockMoveTask).toHaveBeenCalledTimes(2);
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

      expect(mockMoveTask).toHaveBeenCalledWith(
        mockSupabase,
        'task-1',
        'closed-list'
      );
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

      expect(mockMoveTask).toHaveBeenCalledTimes(2);
      expect(mockToast.success).toHaveBeenCalledWith('Success', {
        description: '2 tasks marked as closed',
      });
    });
  });

  describe('handleDelete', () => {
    it('should soft delete single task', async () => {
      queryClient.setQueryData(['tasks', 'board-1'], [mockTask]);
      // Configure the .in() call to resolve to a success response
      mockSupabase.in = vi.fn(() =>
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

      expect(mockSupabase.from).toHaveBeenCalledWith('tasks');
      expect(mockSupabase.update).toHaveBeenCalledWith({
        deleted_at: expect.any(String),
      });
      expect(mockToast.success).toHaveBeenCalledWith('Success', {
        description: 'Task deleted successfully',
      });
      expect(setDeleteDialogOpen).toHaveBeenCalledWith(false);
    });

    it('should handle bulk delete of multiple tasks', async () => {
      const task2: Task = { ...mockTask, id: 'task-2', name: 'Task 2' };
      queryClient.setQueryData(['tasks', 'board-1'], [mockTask, task2]);
      // Configure the .in() call to resolve to a success response
      mockSupabase.in = vi.fn(() =>
        Promise.resolve({ error: null, data: [], count: 2 })
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

      expect(mockSupabase.in).toHaveBeenCalledWith('id', ['task-1', 'task-2']);
      expect(mockToast.success).toHaveBeenCalledWith('Success', {
        description: '2 tasks deleted',
      });
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

      expect(mockUpdateTaskMutation.mutateAsync).toHaveBeenCalledWith({
        taskId: 'task-1',
        updates: { end_date: expect.any(String) },
      });
      expect(mockToast.success).toHaveBeenCalledWith('Due date updated', {
        description: 'Due date set successfully',
      });
    });

    it('should handle bulk due date update', async () => {
      const task2: Task = { ...mockTask, id: 'task-2', name: 'Task 2' };
      queryClient.setQueryData(['tasks', 'board-1'], [mockTask, task2]);
      // Configure the .in() call to resolve to a success response
      mockSupabase.in = vi.fn(() =>
        Promise.resolve({ error: null, data: [], count: 2 })
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

      // Verify the Supabase update was called correctly
      expect(mockSupabase.update).toHaveBeenCalledWith(
        { end_date: expect.any(String) },
        { count: 'exact' }
      );
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

      expect(mockUpdateTaskMutation.mutateAsync).toHaveBeenCalledWith({
        taskId: 'task-1',
        updates: { end_date: null },
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

      expect(mockUpdateTaskMutation.mutateAsync).toHaveBeenCalledWith({
        taskId: 'task-1',
        updates: { priority: 'high' },
      });
      expect(mockToast.success).toHaveBeenCalledWith('Priority updated', {
        description: 'Priority changed',
      });
    });

    it('should handle bulk priority update', async () => {
      const task2: Task = { ...mockTask, id: 'task-2', name: 'Task 2' };
      queryClient.setQueryData(['tasks', 'board-1'], [mockTask, task2]);
      // Configure the .in() call to resolve to a success response
      mockSupabase.in = vi.fn(() =>
        Promise.resolve({ error: null, data: [], count: 2 })
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

      // Verify the Supabase update was called correctly
      expect(mockSupabase.update).toHaveBeenCalledWith(
        { priority: 'high' },
        { count: 'exact' }
      );
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

      expect(mockUpdateTaskMutation.mutateAsync).toHaveBeenCalledWith({
        taskId: 'task-1',
        updates: { estimation_points: 5 },
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
      // Configure the .in() call to resolve to a success response
      mockSupabase.in = vi.fn(() =>
        Promise.resolve({ error: null, data: [], count: 2 })
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

      // Verify the Supabase update was called correctly
      expect(mockSupabase.update).toHaveBeenCalledWith(
        { estimation_points: 8 },
        { count: 'exact' }
      );
    });

    it('should rollback estimation points on update failure', async () => {
      const taskWithEstimation = { ...mockTask, estimation_points: 3 };
      queryClient.setQueryData(['tasks', 'board-1'], [taskWithEstimation]);

      // Mock the mutation to fail
      mockUpdateTaskMutation.mutateAsync = vi
        .fn()
        .mockRejectedValueOnce(new Error('Database connection failed'));

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
          description: 'Database connection failed',
        }
      );

      // Verify loading states were called correctly
      expect(setEstimationSaving).toHaveBeenCalledWith(true);
      expect(setEstimationSaving).toHaveBeenCalledWith(false);
    });
  });

  describe('handleToggleAssignee', () => {
    it('should add assignee to task', async () => {
      queryClient.setQueryData(['tasks', 'board-1'], [mockTask]);
      // Configure the .in() call to resolve to a success response
      mockSupabase.in = vi.fn(() =>
        Promise.resolve({ error: null, data: [], count: 1 })
      );

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
        await result.current.handleToggleAssignee('user-1');
      });

      // Verify the Supabase call was made
      await waitFor(() => {
        expect(mockSupabase.from).toHaveBeenCalledWith('task_assignees');
      });
    });

    it('should remove assignee from task', async () => {
      const taskWithAssignee = {
        ...mockTask,
        assignees: [
          { id: 'user-1', display_name: 'User 1', email: 'user1@test.com' },
        ],
      };
      queryClient.setQueryData(['tasks', 'board-1'], [taskWithAssignee]);
      mockSupabase.eq.mockResolvedValueOnce({ error: null });

      const setIsLoading = vi.fn();

      const { result } = renderHook(
        () =>
          useTaskActions({
            task: taskWithAssignee,
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
        await result.current.handleToggleAssignee('user-1');
      });

      // Verify the Supabase delete was called
      await waitFor(() => {
        expect(mockSupabase.delete).toHaveBeenCalled();
      });
    });

    it('should rollback on error when adding assignee fails', async () => {
      queryClient.setQueryData(['tasks', 'board-1'], [mockTask]);

      // Mock insert to fail (simulating add assignee flow)
      mockSupabase.insert = vi.fn(() =>
        Promise.resolve({
          error: new Error('Database write failed'),
          data: null,
        })
      );

      const setIsLoading = vi.fn();
      const setMenuOpen = vi.fn();
      const onUpdate = vi.fn();

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
      expect(cachedTasks).toEqual([mockTask]);
      expect(cachedTasks?.[0]?.assignees).toEqual([]);

      // Verify loading state was managed correctly
      expect(setIsLoading).toHaveBeenCalledWith(true);
      expect(setIsLoading).toHaveBeenCalledWith(false);
    });

    it('should rollback on error when removing assignee fails', async () => {
      const taskWithAssignee = {
        ...mockTask,
        assignees: [
          { id: 'user-1', display_name: 'User 1', email: 'user1@test.com' },
        ],
      };
      queryClient.setQueryData(['tasks', 'board-1'], [taskWithAssignee]);

      // Mock delete to fail (simulating remove assignee flow)
      mockSupabase.in = vi.fn(() =>
        Promise.resolve({
          error: new Error('Database delete failed'),
          data: null,
        })
      );

      const setIsLoading = vi.fn();
      const setMenuOpen = vi.fn();
      const onUpdate = vi.fn();

      const { result } = renderHook(
        () =>
          useTaskActions({
            task: taskWithAssignee,
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

      expect(mockMoveTask).toHaveBeenCalledWith(
        mockSupabase,
        'task-1',
        'list-2'
      );
      expect(setMenuOpen).toHaveBeenCalledWith(false);
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

      expect(mockMoveTask).not.toHaveBeenCalled();
      expect(setMenuOpen).toHaveBeenCalledWith(false);
    });
  });
});
