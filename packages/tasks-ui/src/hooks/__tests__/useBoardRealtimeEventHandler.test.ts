import { QueryClient } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { describe, expect, it, vi } from 'vitest';
import {
  applyRealtimeTaskUpsert,
  useBoardRealtimeEventHandler,
} from '../useBoardRealtimeEventHandler';

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

describe('useBoardRealtimeEventHandler', () => {
  function setup() {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() =>
      useBoardRealtimeEventHandler({
        boardId: 'board-1',
        queryClient,
        rememberEventId: () => false,
        onTaskChangeRef: { current: undefined },
        onListChangeRef: { current: undefined },
        onTaskRelationsChangeRef: { current: undefined },
      })
    );
    const sprintRefreshes = () =>
      invalidate.mock.calls.filter(
        ([filters]) => filters?.queryKey?.[0] === 'board-sprints'
      ).length;
    return { handle: result.current, sprintRefreshes };
  }

  it('refreshes the board sprints when a task finishes, reopens, moves or is deleted', () => {
    const { handle, sprintRefreshes } = setup();
    handle('task:upsert', {
      task: { id: 'task-1', completed_at: '2026-10-29T00:00:00Z' },
    });
    handle('task:upsert:batch', {
      payloads: [{ task: { id: 'task-2', list_id: 'list-2' } }],
    });
    handle('task:delete', { taskId: 'task-3' });
    expect(sprintRefreshes()).toBe(3);
  });

  it('leaves the board sprints alone for edits that keep membership', () => {
    const { handle, sprintRefreshes } = setup();
    handle('task:upsert', { task: { id: 'task-1', priority: 'high' } });
    expect(sprintRefreshes()).toBe(0);
  });
});
