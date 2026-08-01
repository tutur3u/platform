import type { WorkspaceTaskList } from '@tuturuuu/types';
import { describe, expect, it } from 'vitest';
import { reorderTaskLists } from './board-layout-ordering';

function taskList(
  id: string,
  status: WorkspaceTaskList['status'],
  position: number
): WorkspaceTaskList {
  return {
    archived: false,
    board_id: 'board-1',
    color: 'GRAY',
    created_at: '2026-08-01T00:00:00.000Z',
    creator_id: 'user-1',
    deleted: false,
    id,
    name: id,
    position,
    status,
  };
}

describe('reorderTaskLists', () => {
  it('normalizes and persists the complete reordered status group', () => {
    const lists = [
      taskList('backlog-3', 'not_started', 30),
      taskList('active-1', 'active', 5),
      taskList('backlog-1', 'not_started', 10),
      taskList('backlog-2', 'not_started', 20),
    ];

    const result = reorderTaskLists(lists, 'backlog-1', 'backlog-3');

    expect(result?.updates).toEqual([
      { id: 'backlog-2', position: 0 },
      { id: 'backlog-3', position: 1 },
      { id: 'backlog-1', position: 2 },
    ]);
    expect(
      result?.lists
        .filter((list) => list.status === 'not_started')
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((list) => list.id)
    ).toEqual(['backlog-2', 'backlog-3', 'backlog-1']);
    expect(result?.lists.find((list) => list.id === 'active-1')?.position).toBe(
      5
    );
  });

  it('moves a list across statuses and normalizes both groups', () => {
    const lists = [
      taskList('backlog-1', 'not_started', 0),
      taskList('backlog-2', 'not_started', 8),
      taskList('active-1', 'active', 4),
      taskList('active-2', 'active', 9),
    ];

    const result = reorderTaskLists(lists, 'backlog-1', 'active-2');

    expect(result?.updates).toEqual([
      { id: 'backlog-2', position: 0 },
      { id: 'active-1', position: 0 },
      { id: 'backlog-1', position: 1, status: 'active' },
      { id: 'active-2', position: 2 },
    ]);
    expect(
      result?.lists
        .filter((list) => list.status === 'active')
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((list) => list.id)
    ).toEqual(['active-1', 'backlog-1', 'active-2']);
  });

  it('moves a list into an empty status group', () => {
    const lists = [
      taskList('backlog-1', 'not_started', 0),
      taskList('backlog-2', 'not_started', 1),
    ];

    const result = reorderTaskLists(lists, 'backlog-1', 'status:review');

    expect(result?.updates).toEqual([
      { id: 'backlog-2', position: 0 },
      { id: 'backlog-1', position: 0, status: 'review' },
    ]);
    expect(result?.lists.find((list) => list.id === 'backlog-1')).toMatchObject(
      {
        position: 0,
        status: 'review',
      }
    );
  });
});
