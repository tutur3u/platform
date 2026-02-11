/**
 * @vitest-environment jsdom
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  let broadcastListeners: Map<string, (msg: { payload: any }) => void>;

  const mockTask: Task = {
    id: 'task-1',
    name: 'Test Task',
    list_id: 'list-1',
    created_at: '2025-01-01',
  } as Task;

  const mockTaskWithRelations: Task = {
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
    vi.useFakeTimers();

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    broadcastListeners = new Map();

    mockChannel = {
      on: vi.fn((type: string, config: { event?: string }, callback: any) => {
        if (type === 'broadcast' && config.event) {
          broadcastListeners.set(config.event, callback);
        }
        return mockChannel;
      }),
      subscribe: vi.fn(() => mockChannel),
      send: vi.fn(),
    };

    mockRemoveChannel = vi.fn();

    const { createClient } = await import('@tuturuuu/supabase/next/client');
    mockCreateClient = createClient as any;

    mockCreateClient.mockReturnValue({
      channel: vi.fn(() => mockChannel),
      removeChannel: mockRemoveChannel,
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          in: vi.fn(() =>
            Promise.resolve({
              data: [
                {
                  id: 'task-1',
                  assignees: [
                    {
                      user: {
                        id: 'u-1',
                        display_name: 'User 1',
                        avatar_url: null,
                      },
                    },
                  ],
                  labels: [
                    {
                      label: {
                        id: 'l-1',
                        name: 'Bug',
                        color: 'red',
                        created_at: '2025-01-01',
                      },
                    },
                  ],
                  projects: [
                    {
                      project: {
                        id: 'p-1',
                        name: 'Project 1',
                        status: 'active',
                      },
                    },
                  ],
                },
              ],
              error: null,
            })
          ),
          eq: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({
                data: {
                  id: 'task-1',
                  assignees: [
                    {
                      user: {
                        id: 'u-1',
                        display_name: 'User 1',
                        avatar_url: null,
                      },
                    },
                  ],
                  labels: [
                    {
                      label: {
                        id: 'l-1',
                        name: 'Bug',
                        color: 'red',
                        created_at: '2025-01-01',
                      },
                    },
                  ],
                  projects: [
                    {
                      project: {
                        id: 'p-1',
                        name: 'Project 1',
                        status: 'active',
                      },
                    },
                  ],
                },
                error: null,
              })
            ),
          })),
        })),
      })),
    });

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initialization and cleanup', () => {
    it('should subscribe to channel on mount', () => {
      renderHook(() => useBoardRealtime('board-1', { enabled: true }), {
        wrapper,
      });

      expect(mockChannel.subscribe).toHaveBeenCalledTimes(1);
    });

    it('should create channel with self: false config', () => {
      renderHook(() => useBoardRealtime('board-1', { enabled: true }), {
        wrapper,
      });

      const supabaseInstance = mockCreateClient();
      expect(supabaseInstance.channel).toHaveBeenCalledWith(
        'board-realtime-board-1',
        { config: { broadcast: { self: false } } }
      );
    });

    it('should remove channel after deferred cleanup timeout on unmount', () => {
      const { unmount } = renderHook(
        () => useBoardRealtime('board-1', { enabled: true }),
        { wrapper }
      );

      unmount();

      // removeChannel is deferred — not called immediately
      expect(mockRemoveChannel).not.toHaveBeenCalled();

      // After 100ms deferred timeout, channel is cleaned up
      act(() => {
        vi.advanceTimersByTime(100);
      });

      expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannel);
    });

    it('should not call removeChannel before deferred timeout elapses', () => {
      const { unmount } = renderHook(
        () => useBoardRealtime('board-1', { enabled: true }),
        { wrapper }
      );

      unmount();

      // Advance only 50ms — before the 100ms deferred timeout
      act(() => {
        vi.advanceTimersByTime(50);
      });

      expect(mockRemoveChannel).not.toHaveBeenCalled();

      // Now advance past the timeout
      act(() => {
        vi.advanceTimersByTime(50);
      });

      expect(mockRemoveChannel).toHaveBeenCalledWith(mockChannel);
    });

    it('should not subscribe when enabled is false', () => {
      renderHook(() => useBoardRealtime('board-1', { enabled: false }), {
        wrapper,
      });

      expect(mockChannel.subscribe).not.toHaveBeenCalled();
    });

    it('should not subscribe when boardId is empty', () => {
      renderHook(() => useBoardRealtime('', { enabled: true }), {
        wrapper,
      });

      expect(mockChannel.subscribe).not.toHaveBeenCalled();
    });
  });

  describe('broadcast listener registration', () => {
    it('should register listeners for all 5 broadcast event types', () => {
      renderHook(() => useBoardRealtime('board-1', { enabled: true }), {
        wrapper,
      });

      const events = [
        'task:upsert',
        'task:delete',
        'list:upsert',
        'list:delete',
        'task:relations-changed',
      ];
      for (const event of events) {
        expect(mockChannel.on).toHaveBeenCalledWith(
          'broadcast',
          { event },
          expect.any(Function)
        );
      }
    });
  });

  describe('task:upsert event', () => {
    it('should add new task to cache when task does not exist', async () => {
      queryClient.setQueryData(['tasks', 'board-1'], []);

      renderHook(() => useBoardRealtime('board-1', { enabled: true }), {
        wrapper,
      });

      const listener = broadcastListeners.get('task:upsert')!;

      await act(async () => {
        listener({ payload: { task: mockTask } });
      });

      const cachedTasks = queryClient.getQueryData<Task[]>([
        'tasks',
        'board-1',
      ]);
      expect(cachedTasks).toHaveLength(1);
      expect(cachedTasks?.[0]).toEqual(
        expect.objectContaining({
          id: 'task-1',
          name: 'Test Task',
          assignees: [],
          labels: [],
          projects: [],
        })
      );
    });

    it('should update existing task in cache', async () => {
      queryClient.setQueryData(
        ['tasks', 'board-1'],
        [{ ...mockTaskWithRelations, name: 'Original Name' }]
      );

      renderHook(() => useBoardRealtime('board-1', { enabled: true }), {
        wrapper,
      });

      const listener = broadcastListeners.get('task:upsert')!;

      await act(async () => {
        listener({ payload: { task: { id: 'task-1', name: 'Updated Name' } } });
      });

      const cachedTasks = queryClient.getQueryData<Task[]>([
        'tasks',
        'board-1',
      ]);
      expect(cachedTasks?.[0]?.name).toBe('Updated Name');
      // Preserve existing relations
      expect(cachedTasks?.[0]?.assignees).toEqual([]);
    });

    it('should not duplicate task if already exists in cache', async () => {
      queryClient.setQueryData(['tasks', 'board-1'], [mockTaskWithRelations]);

      renderHook(() => useBoardRealtime('board-1', { enabled: true }), {
        wrapper,
      });

      const listener = broadcastListeners.get('task:upsert')!;

      await act(async () => {
        listener({ payload: { task: mockTask } });
      });

      const cachedTasks = queryClient.getQueryData<Task[]>([
        'tasks',
        'board-1',
      ]);
      expect(cachedTasks).toHaveLength(1);
    });

    it('should call onTaskChange with INSERT for new tasks', async () => {
      queryClient.setQueryData(['tasks', 'board-1'], []);
      const onTaskChange = vi.fn();

      renderHook(
        () => useBoardRealtime('board-1', { enabled: true, onTaskChange }),
        { wrapper }
      );

      const listener = broadcastListeners.get('task:upsert')!;

      await act(async () => {
        listener({ payload: { task: mockTask } });
      });

      expect(onTaskChange).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'task-1' }),
        'INSERT'
      );
    });

    it('should call onTaskChange with UPDATE for existing tasks', async () => {
      queryClient.setQueryData(['tasks', 'board-1'], [mockTaskWithRelations]);
      const onTaskChange = vi.fn();

      renderHook(
        () => useBoardRealtime('board-1', { enabled: true, onTaskChange }),
        { wrapper }
      );

      const listener = broadcastListeners.get('task:upsert')!;

      await act(async () => {
        listener({
          payload: { task: { id: 'task-1', name: 'Updated' } },
        });
      });

      expect(onTaskChange).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'task-1' }),
        'UPDATE'
      );
    });

    it('should initialize cache with task when cache is empty (undefined)', async () => {
      // Don't set any cache data — queryClient returns undefined

      renderHook(() => useBoardRealtime('board-1', { enabled: true }), {
        wrapper,
      });

      const listener = broadcastListeners.get('task:upsert')!;

      await act(async () => {
        listener({ payload: { task: mockTask } });
      });

      const cachedTasks = queryClient.getQueryData<Task[]>([
        'tasks',
        'board-1',
      ]);
      expect(cachedTasks).toHaveLength(1);
    });
  });

  describe('task:delete event', () => {
    it('should remove task from cache', async () => {
      queryClient.setQueryData(['tasks', 'board-1'], [mockTaskWithRelations]);

      renderHook(() => useBoardRealtime('board-1', { enabled: true }), {
        wrapper,
      });

      const listener = broadcastListeners.get('task:delete')!;

      await act(async () => {
        listener({ payload: { taskId: 'task-1' } });
      });

      const cachedTasks = queryClient.getQueryData<Task[]>([
        'tasks',
        'board-1',
      ]);
      expect(cachedTasks).toHaveLength(0);
    });

    it('should call onTaskChange with DELETE', async () => {
      queryClient.setQueryData(['tasks', 'board-1'], [mockTaskWithRelations]);
      const onTaskChange = vi.fn();

      renderHook(
        () => useBoardRealtime('board-1', { enabled: true, onTaskChange }),
        { wrapper }
      );

      const listener = broadcastListeners.get('task:delete')!;

      await act(async () => {
        listener({ payload: { taskId: 'task-1' } });
      });

      expect(onTaskChange).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'task-1' }),
        'DELETE'
      );
    });

    it('should not call onTaskChange if task was not in cache', async () => {
      queryClient.setQueryData(['tasks', 'board-1'], []);
      const onTaskChange = vi.fn();

      renderHook(
        () => useBoardRealtime('board-1', { enabled: true, onTaskChange }),
        { wrapper }
      );

      const listener = broadcastListeners.get('task:delete')!;

      await act(async () => {
        listener({ payload: { taskId: 'task-999' } });
      });

      expect(onTaskChange).not.toHaveBeenCalled();
    });
  });

  describe('list:upsert event', () => {
    it('should add new list to cache', async () => {
      queryClient.setQueryData(['task_lists', 'board-1'], []);

      renderHook(() => useBoardRealtime('board-1', { enabled: true }), {
        wrapper,
      });

      const listener = broadcastListeners.get('list:upsert')!;

      await act(async () => {
        listener({ payload: { list: mockList } });
      });

      const cachedLists = queryClient.getQueryData<TaskList[]>([
        'task_lists',
        'board-1',
      ]);
      expect(cachedLists).toHaveLength(1);
      expect(cachedLists?.[0]).toEqual(
        expect.objectContaining({ id: 'list-1' })
      );
    });

    it('should update existing list in cache', async () => {
      queryClient.setQueryData(['task_lists', 'board-1'], [mockList]);

      renderHook(() => useBoardRealtime('board-1', { enabled: true }), {
        wrapper,
      });

      const listener = broadcastListeners.get('list:upsert')!;

      await act(async () => {
        listener({
          payload: { list: { id: 'list-1', name: 'Updated List' } },
        });
      });

      const cachedLists = queryClient.getQueryData<TaskList[]>([
        'task_lists',
        'board-1',
      ]);
      expect(cachedLists?.[0]?.name).toBe('Updated List');
    });

    it('should call onListChange callback', async () => {
      queryClient.setQueryData(['task_lists', 'board-1'], []);
      const onListChange = vi.fn();

      renderHook(
        () => useBoardRealtime('board-1', { enabled: true, onListChange }),
        { wrapper }
      );

      const listener = broadcastListeners.get('list:upsert')!;

      await act(async () => {
        listener({ payload: { list: mockList } });
      });

      expect(onListChange).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'list-1' }),
        'INSERT'
      );
    });
  });

  describe('list:delete event', () => {
    it('should remove list from cache', async () => {
      queryClient.setQueryData(['task_lists', 'board-1'], [mockList]);

      renderHook(() => useBoardRealtime('board-1', { enabled: true }), {
        wrapper,
      });

      const listener = broadcastListeners.get('list:delete')!;

      await act(async () => {
        listener({ payload: { listId: 'list-1' } });
      });

      const cachedLists = queryClient.getQueryData<TaskList[]>([
        'task_lists',
        'board-1',
      ]);
      expect(cachedLists).toHaveLength(0);
    });

    it('should also remove tasks belonging to deleted list', async () => {
      const task1 = {
        ...mockTaskWithRelations,
        id: 'task-1',
        list_id: 'list-1',
      };
      const task2 = {
        ...mockTaskWithRelations,
        id: 'task-2',
        list_id: 'list-2',
      };
      queryClient.setQueryData(['tasks', 'board-1'], [task1, task2]);
      queryClient.setQueryData(['task_lists', 'board-1'], [mockList]);

      renderHook(() => useBoardRealtime('board-1', { enabled: true }), {
        wrapper,
      });

      const listener = broadcastListeners.get('list:delete')!;

      await act(async () => {
        listener({ payload: { listId: 'list-1' } });
      });

      const cachedTasks = queryClient.getQueryData<Task[]>([
        'tasks',
        'board-1',
      ]);
      expect(cachedTasks).toHaveLength(1);
      expect(cachedTasks?.[0]?.id).toBe('task-2');
    });

    it('should call onListChange with DELETE', async () => {
      queryClient.setQueryData(['task_lists', 'board-1'], [mockList]);
      const onListChange = vi.fn();

      renderHook(
        () => useBoardRealtime('board-1', { enabled: true, onListChange }),
        { wrapper }
      );

      const listener = broadcastListeners.get('list:delete')!;

      await act(async () => {
        listener({ payload: { listId: 'list-1' } });
      });

      expect(onListChange).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'list-1' }),
        'DELETE'
      );
    });
  });

  describe('task:relations-changed event', () => {
    it('should fetch relations from DB and merge into cache', async () => {
      queryClient.setQueryData(
        ['tasks', 'board-1'],
        [{ ...mockTaskWithRelations, id: 'task-1' }]
      );

      renderHook(() => useBoardRealtime('board-1', { enabled: true }), {
        wrapper,
      });

      const listener = broadcastListeners.get('task:relations-changed')!;

      // Fire the listener — it debounces for 150ms before fetching
      await act(async () => {
        listener({ payload: { taskId: 'task-1' } });
      });

      // Advance past the 150ms receiver debounce and flush microtasks
      await act(async () => {
        vi.advanceTimersByTime(200);
        // Allow the async fetch to resolve
        await Promise.resolve();
        await Promise.resolve();
      });

      const cachedTasks = queryClient.getQueryData<Task[]>([
        'tasks',
        'board-1',
      ]);
      const task = cachedTasks?.[0];
      // The mock returns one assignee, one label, one project
      expect(task?.assignees).toHaveLength(1);
      expect(task?.labels).toHaveLength(1);
      expect(task?.projects).toHaveLength(1);
    });

    it('should handle DB fetch errors gracefully', async () => {
      queryClient.setQueryData(['tasks', 'board-1'], [mockTaskWithRelations]);

      // Mock a fetch error
      mockCreateClient.mockReturnValue({
        channel: vi.fn(() => mockChannel),
        removeChannel: mockRemoveChannel,
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(() =>
                Promise.resolve({ data: null, error: { message: 'Not found' } })
              ),
            })),
          })),
        })),
      });

      renderHook(() => useBoardRealtime('board-1', { enabled: true }), {
        wrapper,
      });

      const listener = broadcastListeners.get('task:relations-changed')!;

      // Should not throw
      await act(async () => {
        await listener({ payload: { taskId: 'task-1' } });
      });

      // Cache should remain unchanged
      const cachedTasks = queryClient.getQueryData<Task[]>([
        'tasks',
        'board-1',
      ]);
      expect(cachedTasks?.[0]?.assignees).toEqual([]);
    });
  });

  describe('returned broadcast function', () => {
    it('should return a broadcast function', () => {
      const { result } = renderHook(
        () => useBoardRealtime('board-1', { enabled: true }),
        { wrapper }
      );

      expect(result.current.broadcast).toBeInstanceOf(Function);
    });

    it('should call channel.send with correct format after debounce', () => {
      const { result } = renderHook(
        () => useBoardRealtime('board-1', { enabled: true }),
        { wrapper }
      );

      act(() => {
        result.current.broadcast('task:upsert', {
          task: { id: 'task-1', name: 'Updated' },
        });
      });

      // Broadcast is debounced — should not have sent yet
      expect(mockChannel.send).not.toHaveBeenCalled();

      // Advance past the 50ms sender debounce
      act(() => {
        vi.advanceTimersByTime(50);
      });

      expect(mockChannel.send).toHaveBeenCalledWith({
        type: 'broadcast',
        event: 'task:upsert',
        payload: { task: { id: 'task-1', name: 'Updated' } },
      });
    });

    it('should not throw when channel is not yet available', () => {
      const { result } = renderHook(
        () => useBoardRealtime('board-1', { enabled: false }),
        { wrapper }
      );

      // Should not throw even though channel is null (enabled=false → no channel created)
      expect(() => {
        result.current.broadcast('task:upsert', { task: { id: 'task-1' } });
      }).not.toThrow();
    });
  });
});
