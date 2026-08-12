import { QueryClient } from '@tanstack/react-query';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { describe, expect, it } from 'vitest';
import { applyRealtimeTaskUpsert } from '../useBoardRealtimeEventHandler';

describe('applyRealtimeTaskUpsert', () => {
  it('patches a deadline-only task without inserting a partial board task', () => {
    const queryClient = new QueryClient();
    const deadlineQueryKey = [
      'kanban-deadline-tasks',
      'workspace-1',
      'board-1',
      { search: '' },
    ];
    const deadlineTask = {
      id: 'task-1',
      name: 'Deadline task',
      list_id: 'list-1',
      created_at: '2026-08-12T00:00:00.000Z',
      end_date: '2026-08-15T23:59:59.999Z',
      priority: 'normal',
    } as Task;
    queryClient.setQueryData(['tasks', 'board-1'], []);
    queryClient.setQueryData(deadlineQueryKey, [deadlineTask]);

    applyRealtimeTaskUpsert(queryClient, 'board-1', {
      id: 'task-1',
      priority: 'high',
    });

    expect(queryClient.getQueryData(['tasks', 'board-1'])).toEqual([]);
    expect(queryClient.getQueryData<Task[]>(deadlineQueryKey)).toEqual([
      { ...deadlineTask, priority: 'high' },
    ]);
  });
});
