import type { BoardSprint } from '@tuturuuu/internal-api/task-sprints';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { describe, expect, it } from 'vitest';
import {
  buildLiveSprintSummary,
  getUnfinishedSprintTasks,
  groupTasksByList,
  summaryFromReport,
} from './sprint-summary-model';

const entry = (task_id: string, extra = {}) => ({
  task_id,
  added_after_start: false,
  carry_count: 0,
  end_decision: null,
  ...extra,
});

const task = (id: string, extra: Partial<Task> = {}) =>
  ({ id, name: id, list_id: 'l', display_number: 1, ...extra }) as Task;

const tasksById = new Map(
  [
    task('a', {
      estimation_points: 3,
      completed_at: '2026-10-20',
      assignees: [{ id: 'u1' }],
    }),
    task('b', {
      estimation_points: 5,
      assignees: [{ id: 'u1' }, { id: 'u2' }],
    }),
    task('c', { estimation_points: 2, closed_at: '2026-10-21' }),
    task('gone', { estimation_points: 8, deleted_at: '2026-10-22' }),
  ].map((t) => [t.id, t])
);

const sprint: Pick<BoardSprint, 'tasks'> = {
  tasks: [
    entry('a', { carry_count: 1 }),
    entry('b'),
    entry('c', { added_after_start: true }),
    entry('gone'),
    entry('missing'),
  ],
};

describe('buildLiveSprintSummary', () => {
  it('matches the end_board_sprint report rules', () => {
    expect(buildLiveSprintSummary(sprint, tasksById)).toEqual({
      doneTasks: 2,
      totalTasks: 3,
    });
  });
});

describe('summaryFromReport', () => {
  it('reads the stored report', () => {
    expect(summaryFromReport({ done_tasks: 12, total_tasks: 14 })).toEqual({
      doneTasks: 12,
      totalTasks: 14,
    });
  });
});

describe('unfinished tasks', () => {
  it('lists the open tasks per status column, in board order', () => {
    const open = getUnfinishedSprintTasks(sprint, tasksById);
    expect(open.map((t) => t.id)).toEqual(['b']);

    const lists = [
      { id: 'todo', name: 'To Do' },
      { id: 'doing', name: 'In Progress' },
    ] as TaskList[];
    const groups = groupTasksByList(
      [
        task('p', { list_id: 'doing' }),
        task('q', { list_id: 'todo' }),
        task('r', { list_id: 'doing' }),
        task('s', { list_id: 'gone' }),
      ],
      lists
    );
    expect(
      groups.map((g) => [g.list?.name ?? null, g.tasks.map((t) => t.id)])
    ).toEqual([
      ['To Do', ['q']],
      ['In Progress', ['p', 'r']],
      [null, ['s']],
    ]);
  });
});
