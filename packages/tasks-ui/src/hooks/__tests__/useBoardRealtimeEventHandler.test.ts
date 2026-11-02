import { QueryClient } from '@tanstack/react-query';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { describe, expect, it } from 'vitest';
import { applyRealtimeTaskUpsert } from '../useBoardRealtimeEventHandler';

describe('applyRealtimeTaskUpsert', () => {
  it('does not insert a partial task the board has not loaded', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['tasks', 'board-1'], []);

    applyRealtimeTaskUpsert(queryClient, 'board-1', {
      id: 'task-1',
      priority: 'high',
    });

    expect(queryClient.getQueryData(['tasks', 'board-1'])).toEqual([]);
  });

  it('patches a loaded task in place', () => {
    const queryClient = new QueryClient();
    const task = {
      id: 'task-1',
      name: 'Loaded task',
      list_id: 'list-1',
      created_at: '2026-08-12T00:00:00.000Z',
      priority: 'normal',
    } as Task;
    queryClient.setQueryData(['tasks', 'board-1'], [task]);

    applyRealtimeTaskUpsert(queryClient, 'board-1', {
      id: 'task-1',
      priority: 'high',
    });

    expect(queryClient.getQueryData<Task[]>(['tasks', 'board-1'])).toEqual([
      expect.objectContaining({ id: 'task-1', priority: 'high' }),
    ]);
  });
});
