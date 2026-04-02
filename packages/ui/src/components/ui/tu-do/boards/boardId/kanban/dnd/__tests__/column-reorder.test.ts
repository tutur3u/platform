import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { describe, expect, it } from 'vitest';
import { getColumnReorderUpdates, sortKanbanColumns } from '../column-reorder';

const makeList = (
  id: string,
  status: TaskList['status'],
  position: number
): TaskList => ({
  archived: false,
  board_id: 'board-1',
  color: 'GRAY',
  created_at: '2026-04-01T00:00:00.000Z',
  creator_id: 'user-1',
  deleted: false,
  id,
  name: id,
  position,
  status,
});

describe('getColumnReorderUpdates', () => {
  it('returns sequential updates when reordering within the same status group', () => {
    const columns = [
      makeList('docs', 'documents', 0),
      makeList('todo', 'not_started', 0),
      makeList('backlog', 'not_started', 1),
      makeList('doing', 'active', 0),
    ];

    expect(getColumnReorderUpdates(columns, 'backlog', 'todo')).toEqual([
      { listId: 'backlog', newPosition: 0 },
      { listId: 'todo', newPosition: 1 },
    ]);
  });

  it('ignores attempts to reorder columns across status groups', () => {
    const columns = [
      makeList('todo', 'not_started', 0),
      makeList('doing', 'active', 0),
    ];

    expect(getColumnReorderUpdates(columns, 'todo', 'doing')).toBeNull();
  });

  it('sorts columns in the same order they are rendered in Kanban', () => {
    const columns = [
      makeList('closed', 'closed', 0),
      makeList('active', 'active', 0),
      makeList('docs', 'documents', 0),
      makeList('todo', 'not_started', 0),
      makeList('done', 'done', 0),
    ];

    expect(sortKanbanColumns(columns).map((column) => column.id)).toEqual([
      'docs',
      'todo',
      'active',
      'done',
      'closed',
    ]);
  });
});
