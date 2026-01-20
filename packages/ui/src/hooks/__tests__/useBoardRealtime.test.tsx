/**
 * @vitest-environment jsdom
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBoardRealtime } from '../useBoardRealtime';

// Mock Supabase client
vi.mock('@tuturuuu/supabase/next/client', () => ({
  createClient: vi.fn(),
}));

// Mock DEV_MODE constant
vi.mock('@tuturuuu/utils/constants', () => ({
  DEV_MODE: false,
}));

describe('useBoardRealtime', () => {
  let queryClient: QueryClient;
  let mockChannel: any;
  let mockRemoveChannel: any;
  let mockCreateClient: any;
  let channelListeners: Map<string, any>;

  const mockTask: Task = {
    id: 'task-1',
    name: 'Test Task',
    list_id: 'list-1',
    created_at: '2025-01-01',
  } as Task;

  // Expected task after INSERT with empty relation arrays added
  const mockTaskWithEmptyRelations: Task = {
    ...mockTask,
    assignees: [],
    labels: [],
    projects: [],
  } as Task;

  const mockList: TaskList = {
    id: 'list-1',
    name: 'Test List',
    board_id: 'board-1',
    created_at: '2025-01-01',
  } as TaskList;

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

    channelListeners = new Map();

    // Mock channel methods
    mockChannel = {
      on: vi.fn((type: string, config: any, callback: any) => {
        const key = `${type}:${config.table || 'unknown'}`;
        channelListeners.set(key, callback);
        return mockChannel;
      }),
      subscribe: vi.fn(() => mockChannel),
    };

    mockRemoveChannel = vi.fn();

    // Import and setup mock
    const { createClient } = await import('@tuturuuu/supabase/next/client');
    mockCreateClient = createClient as any;

    mockCreateClient.mockReturnValue({
      channel: vi.fn(() => mockChannel),
      removeChannel: mockRemoveChannel,
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({
                data: {
                  id: 'task-1',
                  assignees: [],
                  labels: [],
                  projects: [],
                },
                error: null,
              })
            ),
            data: [],
            error: null,
          })),
        })),
      })),
    });

    vi.clearAllMocks();
  });

  describe('initialization and cleanup', () => {
    it('should subscribe to channel on mount', () => {
      renderHook(
        () =>
          useBoardRealtime('board-1', ['task-1'], ['list-1'], {
            enabled: true,
          }),
        { wrapper }
      );

      expect(mockChannel.subscribe).toHaveBeenCalledTimes(1);
    });

    it('should unsubscribe on unmount', () => {
      const { unmount } = renderHook(
        () =>
          useBoardRealtime('board-1', ['task-1'], ['list-1'], {
            enabled: true,
          }),
        { wrapper }
      );

      unmount();

      expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannel);
    });

    it('should not subscribe when enabled is false', () => {
      renderHook(
        () =>
          useBoardRealtime('board-1', ['task-1'], ['list-1'], {
            enabled: false,
          }),
        { wrapper }
      );

      expect(mockChannel.subscribe).not.toHaveBeenCalled();
    });

    it('should not subscribe when boardId is empty', () => {
      renderHook(
        () =>
          useBoardRealtime('', ['task-1'], ['list-1'], {
            enabled: true,
          }),
        { wrapper }
      );

      expect(mockChannel.subscribe).not.toHaveBeenCalled();
    });
  });

  describe('task_lists listener', () => {
    it('should set up listener for task_lists table', () => {
      renderHook(
        () =>
          useBoardRealtime('board-1', ['task-1'], ['list-1'], {
            enabled: true,
          }),
        { wrapper }
      );

      expect(mockChannel.on).toHaveBeenCalledWith(
        'postgres_changes',
        expect.objectContaining({
          event: '*',
          schema: 'public',
          table: 'task_lists',
          filter: 'board_id=eq.board-1',
        }),
        expect.any(Function)
      );
    });

    it('should not invalidate queries when task list changes (realtime sync engine handles updates)', async () => {
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      renderHook(
        () =>
          useBoardRealtime('board-1', ['task-1'], ['list-1'], {
            enabled: true,
          }),
        { wrapper }
      );

      const listListener = channelListeners.get('postgres_changes:task_lists');

      await act(async () => {
        await listListener({
          eventType: 'UPDATE',
          new: mockList,
          old: mockList,
        });
      });

      // Realtime sync engine handles updates directly, no query invalidation needed
      expect(invalidateSpy).not.toHaveBeenCalled();
    });

    it('should call onListChange callback when provided', async () => {
      const onListChange = vi.fn();

      renderHook(
        () =>
          useBoardRealtime('board-1', ['task-1'], ['list-1'], {
            enabled: true,
            onListChange,
          }),
        { wrapper }
      );

      const listListener = channelListeners.get('postgres_changes:task_lists');

      await act(async () => {
        await listListener({
          eventType: 'UPDATE',
          new: mockList,
          old: null,
        });
      });

      expect(onListChange).toHaveBeenCalledWith(mockList, 'UPDATE');
    });
  });

  describe('tasks listener', () => {
    it('should set up listener for tasks table when lists are provided', () => {
      renderHook(
        () =>
          useBoardRealtime('board-1', ['task-1'], ['list-1', 'list-2'], {
            enabled: true,
          }),
        { wrapper }
      );

      expect(mockChannel.on).toHaveBeenCalledWith(
        'postgres_changes',
        expect.objectContaining({
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: 'list_id=in.(list-1,list-2)',
        }),
        expect.any(Function)
      );
    });

    it('should not set up tasks listener when no lists provided', () => {
      renderHook(
        () =>
          useBoardRealtime('board-1', ['task-1'], [], {
            enabled: true,
          }),
        { wrapper }
      );

      const taskListenerCalls = vi
        .mocked(mockChannel.on)
        .mock.calls.filter((call: unknown[]) => {
          const config = call[1] as any;
          return config && config.table === 'tasks';
        });
      expect(taskListenerCalls).toHaveLength(0);
    });

    it('should handle INSERT event by adding task to cache', async () => {
      queryClient.setQueryData(['tasks', 'board-1'], []);

      renderHook(
        () =>
          useBoardRealtime('board-1', ['task-1'], ['list-1'], {
            enabled: true,
          }),
        { wrapper }
      );

      const taskListener = channelListeners.get('postgres_changes:tasks');

      await act(async () => {
        await taskListener({
          eventType: 'INSERT',
          new: mockTask,
          old: null,
        });
      });

      const cachedTasks = queryClient.getQueryData<Task[]>([
        'tasks',
        'board-1',
      ]);
      expect(cachedTasks).toHaveLength(1);
      // INSERT should add task with empty relation arrays
      expect(cachedTasks?.[0]).toEqual(mockTaskWithEmptyRelations);
    });

    it('should handle UPDATE event by updating task in cache', async () => {
      const originalTask = { ...mockTask, name: 'Original Name' };
      queryClient.setQueryData(['tasks', 'board-1'], [originalTask]);

      renderHook(
        () =>
          useBoardRealtime('board-1', ['task-1'], ['list-1'], {
            enabled: true,
          }),
        { wrapper }
      );

      const taskListener = channelListeners.get('postgres_changes:tasks');

      const updatedTask = { ...mockTask, name: 'Updated Name' };
      await act(async () => {
        await taskListener({
          eventType: 'UPDATE',
          new: updatedTask,
          old: originalTask,
        });
      });

      const cachedTasks = queryClient.getQueryData<Task[]>([
        'tasks',
        'board-1',
      ]);
      expect(cachedTasks?.[0]?.name).toBe('Updated Name');
    });

    it('should handle DELETE event by removing task from cache', async () => {
      queryClient.setQueryData(['tasks', 'board-1'], [mockTask]);

      renderHook(
        () =>
          useBoardRealtime('board-1', ['task-1'], ['list-1'], {
            enabled: true,
          }),
        { wrapper }
      );

      const taskListener = channelListeners.get('postgres_changes:tasks');

      await act(async () => {
        await taskListener({
          eventType: 'DELETE',
          old: mockTask,
          new: null,
        });
      });

      const cachedTasks = queryClient.getQueryData<Task[]>([
        'tasks',
        'board-1',
      ]);
      expect(cachedTasks).toHaveLength(0);
    });

    it('should call onTaskChange callback when provided', async () => {
      const onTaskChange = vi.fn();

      renderHook(
        () =>
          useBoardRealtime('board-1', ['task-1'], ['list-1'], {
            enabled: true,
            onTaskChange,
          }),
        { wrapper }
      );

      const taskListener = channelListeners.get('postgres_changes:tasks');

      await act(async () => {
        await taskListener({
          eventType: 'UPDATE',
          new: mockTask,
          old: mockTask,
        });
      });

      expect(onTaskChange).toHaveBeenCalledWith(mockTask, 'UPDATE');
    });
  });

  describe('task_assignees listener', () => {
    it('should set up listener for task_assignees table', () => {
      renderHook(
        () =>
          useBoardRealtime('board-1', ['task-1'], ['list-1'], {
            enabled: true,
          }),
        { wrapper }
      );

      expect(mockChannel.on).toHaveBeenCalledWith(
        'postgres_changes',
        expect.objectContaining({
          event: '*',
          schema: 'public',
          table: 'task_assignees',
        }),
        expect.any(Function)
      );
    });

    it('should update task relations in cache when assignee changes', async () => {
      const setQueryDataSpy = vi.spyOn(queryClient, 'setQueryData');

      // Set up initial task in cache
      queryClient.setQueryData(
        ['tasks', 'board-1'],
        [mockTaskWithEmptyRelations]
      );

      renderHook(
        () =>
          useBoardRealtime('board-1', ['task-1'], ['list-1'], {
            enabled: true,
          }),
        { wrapper }
      );

      const assigneeListener = channelListeners.get(
        'postgres_changes:task_assignees'
      );

      await act(async () => {
        await assigneeListener({
          eventType: 'INSERT',
          new: { task_id: 'task-1', user_id: 'user-1' },
          old: null,
        });
      });

      // Should use setQueryData to update cache directly (via fetchAndUpdateTaskRelations)
      expect(setQueryDataSpy).toHaveBeenCalled();
    });

    it('should only process changes for tasks in the current board', async () => {
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      renderHook(
        () =>
          useBoardRealtime('board-1', ['task-1'], ['list-1'], {
            enabled: true,
          }),
        { wrapper }
      );

      const assigneeListener = channelListeners.get(
        'postgres_changes:task_assignees'
      );

      // Change for task NOT in current board
      await act(async () => {
        await assigneeListener({
          eventType: 'INSERT',
          new: { task_id: 'task-999', user_id: 'user-1' },
          old: null,
        });
      });

      expect(invalidateSpy).not.toHaveBeenCalled();
    });
  });

  describe('task_labels listener', () => {
    it('should set up listener for task_labels table', () => {
      renderHook(
        () =>
          useBoardRealtime('board-1', ['task-1'], ['list-1'], {
            enabled: true,
          }),
        { wrapper }
      );

      expect(mockChannel.on).toHaveBeenCalledWith(
        'postgres_changes',
        expect.objectContaining({
          event: '*',
          schema: 'public',
          table: 'task_labels',
        }),
        expect.any(Function)
      );
    });

    it('should update task relations in cache when label changes', async () => {
      const setQueryDataSpy = vi.spyOn(queryClient, 'setQueryData');

      // Set up initial task in cache
      queryClient.setQueryData(
        ['tasks', 'board-1'],
        [mockTaskWithEmptyRelations]
      );

      renderHook(
        () =>
          useBoardRealtime('board-1', ['task-1'], ['list-1'], {
            enabled: true,
          }),
        { wrapper }
      );

      const labelListener = channelListeners.get(
        'postgres_changes:task_labels'
      );

      await act(async () => {
        await labelListener({
          eventType: 'INSERT',
          new: { task_id: 'task-1', label_id: 'label-1' },
          old: null,
        });
      });

      // Should use setQueryData to update cache directly (via fetchAndUpdateTaskRelations)
      expect(setQueryDataSpy).toHaveBeenCalled();
    });

    it('should only process changes for tasks in the current board', async () => {
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      renderHook(
        () =>
          useBoardRealtime('board-1', ['task-1'], ['list-1'], {
            enabled: true,
          }),
        { wrapper }
      );

      const labelListener = channelListeners.get(
        'postgres_changes:task_labels'
      );

      // Change for task NOT in current board
      await act(async () => {
        await labelListener({
          eventType: 'INSERT',
          new: { task_id: 'task-999', label_id: 'label-1' },
          old: null,
        });
      });

      expect(invalidateSpy).not.toHaveBeenCalled();
    });
  });

  describe('task_project_tasks listener', () => {
    it('should set up listener for task_project_tasks table', () => {
      renderHook(
        () =>
          useBoardRealtime('board-1', ['task-1'], ['list-1'], {
            enabled: true,
          }),
        { wrapper }
      );

      expect(mockChannel.on).toHaveBeenCalledWith(
        'postgres_changes',
        expect.objectContaining({
          event: '*',
          schema: 'public',
          table: 'task_project_tasks',
        }),
        expect.any(Function)
      );
    });

    it('should update task relations in cache when project assignment changes', async () => {
      const setQueryDataSpy = vi.spyOn(queryClient, 'setQueryData');

      // Set up initial task in cache
      queryClient.setQueryData(
        ['tasks', 'board-1'],
        [mockTaskWithEmptyRelations]
      );

      renderHook(
        () =>
          useBoardRealtime('board-1', ['task-1'], ['list-1'], {
            enabled: true,
          }),
        { wrapper }
      );

      const projectListener = channelListeners.get(
        'postgres_changes:task_project_tasks'
      );

      await act(async () => {
        await projectListener({
          eventType: 'INSERT',
          new: { task_id: 'task-1', project_id: 'project-1' },
          old: null,
        });
      });

      // Should use setQueryData to update cache directly (via fetchAndUpdateTaskRelations)
      expect(setQueryDataSpy).toHaveBeenCalled();
    });

    it('should only process changes for tasks in the current board', async () => {
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      renderHook(
        () =>
          useBoardRealtime('board-1', ['task-1'], ['list-1'], {
            enabled: true,
          }),
        { wrapper }
      );

      const projectListener = channelListeners.get(
        'postgres_changes:task_project_tasks'
      );

      // Change for task NOT in current board
      await act(async () => {
        await projectListener({
          eventType: 'INSERT',
          new: { task_id: 'task-999', project_id: 'project-1' },
          old: null,
        });
      });

      expect(invalidateSpy).not.toHaveBeenCalled();
    });
  });

  describe('direct cache update semantics', () => {
    it('should use setQueryData to update task relations directly instead of invalidating', async () => {
      const setQueryDataSpy = vi.spyOn(queryClient, 'setQueryData');

      // Set up initial task in cache
      queryClient.setQueryData(
        ['tasks', 'board-1'],
        [mockTaskWithEmptyRelations]
      );

      renderHook(
        () =>
          useBoardRealtime('board-1', ['task-1'], ['list-1'], {
            enabled: true,
          }),
        { wrapper }
      );

      // Test assignees
      const assigneeListener = channelListeners.get(
        'postgres_changes:task_assignees'
      );
      await act(async () => {
        await assigneeListener({
          eventType: 'INSERT',
          new: { task_id: 'task-1', user_id: 'user-1' },
          old: null,
        });
        // Wait for async fetchAndUpdateTaskRelations to complete
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      // Should use setQueryData, not invalidateQueries
      expect(setQueryDataSpy).toHaveBeenCalled();

      setQueryDataSpy.mockClear();

      // Test labels
      const labelListener = channelListeners.get(
        'postgres_changes:task_labels'
      );
      await act(async () => {
        await labelListener({
          eventType: 'INSERT',
          new: { task_id: 'task-1', label_id: 'label-1' },
          old: null,
        });
        // Wait for async fetchAndUpdateTaskRelations to complete
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      // Should use setQueryData, not invalidateQueries
      expect(setQueryDataSpy).toHaveBeenCalled();

      setQueryDataSpy.mockClear();

      // Test project tasks
      const projectListener = channelListeners.get(
        'postgres_changes:task_project_tasks'
      );
      await act(async () => {
        await projectListener({
          eventType: 'INSERT',
          new: { task_id: 'task-1', project_id: 'project-1' },
          old: null,
        });
        // Wait for async fetchAndUpdateTaskRelations to complete
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      // Should use setQueryData, not invalidateQueries
      expect(setQueryDataSpy).toHaveBeenCalled();
    });

    it('should not trigger immediate refetch when updating cache directly', async () => {
      queryClient.setQueryData(
        ['tasks', 'board-1'],
        [mockTaskWithEmptyRelations]
      );
      const fetchFn = vi.fn().mockResolvedValue([mockTaskWithEmptyRelations]);

      // Register a query with a fetch function
      await queryClient.prefetchQuery({
        queryKey: ['tasks', 'board-1'],
        queryFn: fetchFn,
      });

      fetchFn.mockClear();

      renderHook(
        () =>
          useBoardRealtime('board-1', ['task-1'], ['list-1'], {
            enabled: true,
          }),
        { wrapper }
      );

      const assigneeListener = channelListeners.get(
        'postgres_changes:task_assignees'
      );

      await act(async () => {
        await assigneeListener({
          eventType: 'INSERT',
          new: { task_id: 'task-1', user_id: 'user-1' },
          old: null,
        });
      });

      // Wait a bit to ensure no refetch happens
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify fetch was NOT called (direct cache update prevents unnecessary refetch)
      expect(fetchFn).not.toHaveBeenCalled();
    });
  });

  describe('stable array dependencies', () => {
    it('should not recreate listeners when task IDs change but content is same', () => {
      const { rerender } = renderHook(
        ({ taskIds }) =>
          useBoardRealtime('board-1', taskIds, ['list-1'], {
            enabled: true,
          }),
        {
          wrapper,
          initialProps: { taskIds: ['task-1', 'task-2'] },
        }
      );

      const initialCallCount = mockChannel.on.mock.calls.length;

      // Rerender with new array but same content
      rerender({ taskIds: ['task-1', 'task-2'] });

      // Should not have called channel.on again
      expect(mockChannel.on.mock.calls.length).toBe(initialCallCount);
    });

    it('should recreate listeners when task IDs actually change', () => {
      const { rerender } = renderHook(
        ({ taskIds }) =>
          useBoardRealtime('board-1', taskIds, ['list-1'], {
            enabled: true,
          }),
        {
          wrapper,
          initialProps: { taskIds: ['task-1'] },
        }
      );

      const initialCallCount = mockChannel.on.mock.calls.length;

      // Rerender with different content
      rerender({ taskIds: ['task-1', 'task-2', 'task-3'] });

      // Should have recreated listeners
      expect(mockChannel.on.mock.calls.length).toBeGreaterThan(
        initialCallCount
      );
    });
  });

  describe('workspace_task_labels listener', () => {
    it('should set up listener for workspace_task_labels table', () => {
      renderHook(
        () =>
          useBoardRealtime('board-1', ['task-1'], ['list-1'], {
            enabled: true,
          }),
        { wrapper }
      );

      expect(mockChannel.on).toHaveBeenCalledWith(
        'postgres_changes',
        expect.objectContaining({
          event: 'UPDATE',
          schema: 'public',
          table: 'workspace_task_labels',
        }),
        expect.any(Function)
      );
    });

    it('should invalidate queries when workspace label affects board tasks', async () => {
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      // Mock task_labels query to return linked tasks
      mockCreateClient.mockReturnValue({
        channel: vi.fn(() => mockChannel),
        removeChannel: mockRemoveChannel,
        from: vi.fn((table: string) => {
          if (table === 'task_labels') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn(),
                  data: [{ task_id: 'task-1' }],
                  error: null,
                })),
              })),
            };
          }
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: {
                      id: 'task-1',
                      assignees: [],
                      labels: [],
                      projects: [],
                    },
                    error: null,
                  })
                ),
                data: [],
                error: null,
              })),
            })),
          };
        }),
      });

      renderHook(
        () =>
          useBoardRealtime('board-1', ['task-1'], ['list-1'], {
            enabled: true,
          }),
        { wrapper }
      );

      const labelListener = channelListeners.get(
        'postgres_changes:workspace_task_labels'
      );

      await act(async () => {
        await labelListener({
          eventType: 'UPDATE',
          new: { id: 'label-1', name: 'Updated Label' },
          old: { id: 'label-1', name: 'Old Label' },
        });
      });

      // Should invalidate tasks query when workspace label affects board tasks
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['tasks', 'board-1'],
      });
    });

    it('should not invalidate queries when workspace label does not affect board tasks', async () => {
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      // Mock task_labels query to return no linked tasks
      mockCreateClient.mockReturnValue({
        channel: vi.fn(() => mockChannel),
        removeChannel: mockRemoveChannel,
        from: vi.fn((table: string) => {
          if (table === 'task_labels') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn(),
                  data: [],
                  error: null,
                })),
              })),
            };
          }
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(() =>
                  Promise.resolve({
                    data: {
                      id: 'task-1',
                      assignees: [],
                      labels: [],
                      projects: [],
                    },
                    error: null,
                  })
                ),
                data: [],
                error: null,
              })),
            })),
          };
        }),
      });

      renderHook(
        () =>
          useBoardRealtime('board-1', ['task-1'], ['list-1'], {
            enabled: true,
          }),
        { wrapper }
      );

      const labelListener = channelListeners.get(
        'postgres_changes:workspace_task_labels'
      );

      invalidateSpy.mockClear();

      await act(async () => {
        await labelListener({
          eventType: 'UPDATE',
          new: { id: 'label-2', name: 'Unrelated Label' },
          old: { id: 'label-2', name: 'Old Unrelated' },
        });
      });

      // Should not invalidate when no tasks in board use this label
      expect(invalidateSpy).not.toHaveBeenCalled();
    });
  });

  describe('UPDATE event with soft delete', () => {
    it('should remove task from cache when deleted_at is set', async () => {
      queryClient.setQueryData(['tasks', 'board-1'], [mockTask]);

      renderHook(
        () =>
          useBoardRealtime('board-1', ['task-1'], ['list-1'], {
            enabled: true,
          }),
        { wrapper }
      );

      const taskListener = channelListeners.get('postgres_changes:tasks');

      const softDeletedTask = {
        ...mockTask,
        deleted_at: new Date().toISOString(),
      };

      await act(async () => {
        await taskListener({
          eventType: 'UPDATE',
          new: softDeletedTask,
          old: mockTask,
        });
      });

      const cachedTasks = queryClient.getQueryData<Task[]>([
        'tasks',
        'board-1',
      ]);
      expect(cachedTasks).toHaveLength(0);
    });
  });

  describe('INSERT event with existing task', () => {
    it('should not duplicate task if already exists in cache', async () => {
      queryClient.setQueryData(
        ['tasks', 'board-1'],
        [mockTaskWithEmptyRelations]
      );

      renderHook(
        () =>
          useBoardRealtime('board-1', ['task-1'], ['list-1'], {
            enabled: true,
          }),
        { wrapper }
      );

      const taskListener = channelListeners.get('postgres_changes:tasks');

      await act(async () => {
        await taskListener({
          eventType: 'INSERT',
          new: mockTask,
          old: null,
        });
      });

      const cachedTasks = queryClient.getQueryData<Task[]>([
        'tasks',
        'board-1',
      ]);
      expect(cachedTasks).toHaveLength(1);
    });
  });

  describe('INSERT event with delayed relation fetch', () => {
    it('should add task to cache immediately on INSERT', async () => {
      queryClient.setQueryData(['tasks', 'board-1'], []);

      renderHook(
        () =>
          useBoardRealtime('board-1', ['task-1'], ['list-1'], {
            enabled: true,
          }),
        { wrapper }
      );

      const taskListener = channelListeners.get('postgres_changes:tasks');

      await act(async () => {
        await taskListener({
          eventType: 'INSERT',
          new: mockTask,
          old: null,
        });
      });

      // Task should be added to cache with empty relations
      const cachedTasks = queryClient.getQueryData<Task[]>([
        'tasks',
        'board-1',
      ]);
      expect(cachedTasks).toHaveLength(1);
      expect(cachedTasks?.[0]).toHaveProperty('assignees');
      expect(cachedTasks?.[0]?.assignees).toEqual([]);
    });
  });
});
