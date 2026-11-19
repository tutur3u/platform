import type { Task } from '@tuturuuu/types/primitives/Task';
import { describe, expect, it } from 'vitest';
import { groupKanbanTasks } from './group-kanban-tasks';

function task(id: string, listId: string, extra: Partial<Task> = {}): Task {
  return {
    id,
    name: id,
    list_id: listId,
    display_number: 1,
    created_at: '2026-11-19T00:00:00Z',
    ...extra,
  } as Task;
}

const lists = [
  { id: 'todo', status: 'active' },
  { id: 'done', status: 'done' },
  { id: 'closed', status: 'closed' },
  { id: 'empty', status: 'not_started' },
];

describe('groupKanbanTasks', () => {
  it('groups by list in one pass and gives every list an array', () => {
    const grouped = groupKanbanTasks(
      [task('a', 'todo'), task('b', 'done'), task('x', 'unknown-list')],
      lists,
      true
    );
    expect(grouped.get('todo')?.map((t) => t.id)).toEqual(['a']);
    expect(grouped.get('done')?.map((t) => t.id)).toEqual(['b']);
    expect(grouped.get('empty')).toEqual([]);
    expect(grouped.has('unknown-list')).toBe(false);
  });

  it('sorts done by completion and closed by close time, newest first', () => {
    const grouped = groupKanbanTasks(
      [
        task('d1', 'done', { completed_at: '2026-11-18T08:00:00Z' }),
        task('d2', 'done', { completed_at: '2026-11-19T08:00:00Z' }),
        task('d3', 'done'),
        task('c1', 'closed', { closed_at: '2026-11-10T08:00:00Z' }),
        task('c2', 'closed', { closed_at: '2026-11-12T08:00:00Z' }),
      ],
      lists,
      true
    );
    expect(grouped.get('done')?.map((t) => t.id)).toEqual(['d2', 'd1', 'd3']);
    expect(grouped.get('closed')?.map((t) => t.id)).toEqual(['c2', 'c1']);
  });

  it('keeps the caller order for open lists when sorting is disabled', () => {
    const grouped = groupKanbanTasks(
      [task('b', 'todo', { sort_key: 2 }), task('a', 'todo', { sort_key: 1 })],
      lists,
      true
    );
    expect(grouped.get('todo')?.map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('sorts open lists by effective sort key when sorting is enabled', () => {
    const grouped = groupKanbanTasks(
      [task('b', 'todo', { sort_key: 2 }), task('a', 'todo', { sort_key: 1 })],
      lists,
      false
    );
    expect(grouped.get('todo')?.map((t) => t.id)).toEqual(['a', 'b']);
  });
});
