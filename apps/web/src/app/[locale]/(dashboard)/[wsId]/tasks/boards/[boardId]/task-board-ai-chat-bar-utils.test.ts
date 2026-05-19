import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { TaskBoardAiChatBarTask } from './task-board-ai-chat-bar-types';
import {
  mergeCreatedTasks,
  publishTaskBoardAiCreatedTasks,
} from './task-board-ai-chat-bar-utils';

function makeTask(
  overrides: Partial<TaskBoardAiChatBarTask> & { id: string }
): TaskBoardAiChatBarTask {
  const { id, ...rest } = overrides;

  return {
    assignees: [],
    created_at: '2026-05-19T00:00:00.000Z',
    id,
    labels: [],
    list_id: 'list-1',
    name: 'Task',
    projects: [],
    sort_key: 1000,
    ...rest,
  } as TaskBoardAiChatBarTask;
}

describe('task board AI chat bar cache utilities', () => {
  it('merges created tasks without dropping relation arrays', () => {
    const result = mergeCreatedTasks(undefined, [
      makeTask({
        id: 'task-1',
        name: 'Created task',
      }),
    ]);

    expect(result).toEqual([
      expect.objectContaining({
        assignees: [],
        id: 'task-1',
        labels: [],
        name: 'Created task',
        projects: [],
      }),
    ]);
  });

  it('patches task caches and broadcasts realtime updates without invalidating board tasks', () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const broadcast = vi.fn();
    const refreshActiveBoard = vi.fn();
    const existingTask = makeTask({ id: 'task-existing', name: 'Existing' });
    const createdTask = makeTask({
      assignee_ids: ['user-1'],
      id: 'task-created',
      label_ids: ['label-1'],
      name: 'Created from AI',
      project_ids: ['project-1'],
      sort_key: 500,
    });

    queryClient.setQueryData(['tasks', 'board-1'], [existingTask]);
    queryClient.setQueryData(['tasks-full', 'board-1'], [existingTask]);

    publishTaskBoardAiCreatedTasks({
      boardId: 'board-1',
      broadcast,
      queryClient,
      refreshActiveBoard,
      tasks: [createdTask],
    });

    expect(queryClient.getQueryData(['tasks', 'board-1'])).toEqual([
      existingTask,
      expect.objectContaining({ id: 'task-created' }),
    ]);
    expect(queryClient.getQueryData(['tasks-full', 'board-1'])).toEqual([
      existingTask,
      expect.objectContaining({ id: 'task-created' }),
    ]);
    expect(broadcast).toHaveBeenCalledWith('task:upsert', {
      task: createdTask,
    });
    expect(broadcast).toHaveBeenCalledWith('task:relations-changed', {
      taskIds: ['task-created'],
    });
    expect(refreshActiveBoard).toHaveBeenCalledWith({ invalidateTasks: false });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
