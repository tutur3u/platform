import { QueryClient } from '@tanstack/react-query';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { describe, expect, it } from 'vitest';
import {
  patchTaskInVisibleCaches,
  restoreTasksFromVisibleCacheSnapshot,
  snapshotVisibleTaskCaches,
} from '../task-cache-patches';

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function createTask(id: string, name = id): Task {
  return {
    id,
    name,
    list_id: 'list-1',
    display_number: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    labels: [],
    projects: [],
    assignees: [],
  };
}

describe('task-cache-patches', () => {
  it('patches every visible cache that can render a task card or detail view', () => {
    const queryClient = createQueryClient();
    const task = createTask('task-1');

    queryClient.setQueryData(['tasks', 'board-1'], [task]);
    queryClient.setQueryData(['tasks-full', 'board-1', 'all'], [task]);
    queryClient.setQueryData(['task', 'task-1'], task);
    queryClient.setQueryData(['workspaceTask', 'ws-1', 'task-1'], { task });
    queryClient.setQueryData(['my-tasks', 'ws-1'], {
      overdue: [],
      today: [task],
      upcoming: [],
      completed: [],
    });
    queryClient.setQueryData(['my-completed-tasks', 'ws-1'], {
      pages: [{ completed: [task] }],
    });
    const patchedLabel = {
      id: 'label-1',
      name: 'Bug',
      color: '#ef4444',
      created_at: '2026-01-01T00:00:00.000Z',
    };

    patchTaskInVisibleCaches({
      queryClient,
      boardId: 'board-1',
      taskId: 'task-1',
      updater: (cachedTask) => ({
        ...cachedTask,
        labels: [patchedLabel],
      }),
    });

    expect(
      queryClient.getQueryData<Task[]>(['tasks', 'board-1'])?.[0]?.labels
    ).toEqual([patchedLabel]);
    expect(
      queryClient.getQueryData<Task[]>(['tasks-full', 'board-1', 'all'])?.[0]
        ?.labels
    ).toEqual([patchedLabel]);
    expect(queryClient.getQueryData<Task>(['task', 'task-1'])?.labels).toEqual([
      patchedLabel,
    ]);
    expect(
      queryClient.getQueryData<{ task?: Task }>([
        'workspaceTask',
        'ws-1',
        'task-1',
      ])?.task?.labels
    ).toEqual([patchedLabel]);
    expect(
      queryClient.getQueryData<{ today?: Task[] }>(['my-tasks', 'ws-1'])
        ?.today?.[0]?.labels
    ).toEqual([patchedLabel]);
    expect(
      queryClient.getQueryData<{ pages?: Array<{ completed?: Task[] }> }>([
        'my-completed-tasks',
        'ws-1',
      ])?.pages?.[0]?.completed?.[0]?.labels
    ).toEqual([patchedLabel]);
  });

  it('restores only failed task ids from a snapshot', () => {
    const queryClient = createQueryClient();
    const taskOne = createTask('task-1', 'One');
    const taskTwo = createTask('task-2', 'Two');

    queryClient.setQueryData(['tasks', 'board-1'], [taskOne, taskTwo]);
    queryClient.setQueryData(
      ['tasks-full', 'board-1', 'all'],
      [taskOne, taskTwo]
    );
    const snapshot = snapshotVisibleTaskCaches(queryClient, 'board-1', [
      'task-1',
      'task-2',
    ]);

    for (const taskId of ['task-1', 'task-2']) {
      patchTaskInVisibleCaches({
        queryClient,
        boardId: 'board-1',
        taskId,
        updater: (cachedTask) => ({
          ...cachedTask,
          projects: [{ id: 'project-1', name: 'Roadmap', status: 'active' }],
        }),
      });
    }

    restoreTasksFromVisibleCacheSnapshot({
      queryClient,
      snapshot,
      taskIds: ['task-2'],
    });

    const tasks = queryClient.getQueryData<Task[]>(['tasks', 'board-1']);
    const fullTasks = queryClient.getQueryData<Task[]>([
      'tasks-full',
      'board-1',
      'all',
    ]);

    expect(tasks?.find((task) => task.id === 'task-1')?.projects).toEqual([
      { id: 'project-1', name: 'Roadmap', status: 'active' },
    ]);
    expect(tasks?.find((task) => task.id === 'task-2')?.projects).toEqual([]);
    expect(fullTasks?.find((task) => task.id === 'task-1')?.projects).toEqual([
      { id: 'project-1', name: 'Roadmap', status: 'active' },
    ]);
    expect(fullTasks?.find((task) => task.id === 'task-2')?.projects).toEqual(
      []
    );
  });
});
