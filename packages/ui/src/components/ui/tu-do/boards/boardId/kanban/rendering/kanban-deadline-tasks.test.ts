import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { describe, expect, it } from 'vitest';
import { buildKanbanDeadlineSections } from './kanban-deadline-tasks';

type TestTask = Task & {
  completed?: boolean | null;
};

const NOW = new Date('2026-05-31T12:00:00.000Z');

const lists: TaskList[] = [
  {
    archived: false,
    board_id: 'board-1',
    color: 'BLUE',
    created_at: '2026-05-01T00:00:00.000Z',
    creator_id: 'user-1',
    deleted: false,
    id: 'active-list',
    name: 'Active',
    position: 0,
    status: 'active',
  },
  {
    archived: false,
    board_id: 'board-1',
    color: 'GRAY',
    created_at: '2026-05-01T00:00:00.000Z',
    creator_id: 'user-1',
    deleted: false,
    id: 'todo-list',
    name: 'To Do',
    position: 1,
    status: 'not_started',
  },
  {
    archived: false,
    board_id: 'board-1',
    color: 'ORANGE',
    created_at: '2026-05-01T00:00:00.000Z',
    creator_id: 'user-1',
    deleted: false,
    id: 'review-list',
    name: 'Review',
    position: 2,
    status: 'review',
  },
  {
    archived: false,
    board_id: 'board-1',
    color: 'GREEN',
    created_at: '2026-05-01T00:00:00.000Z',
    creator_id: 'user-1',
    deleted: false,
    id: 'done-list',
    name: 'Done',
    position: 3,
    status: 'done',
  },
  {
    archived: false,
    board_id: 'board-1',
    color: 'PURPLE',
    created_at: '2026-05-01T00:00:00.000Z',
    creator_id: 'user-1',
    deleted: false,
    id: 'closed-list',
    name: 'Closed',
    position: 4,
    status: 'closed',
  },
  {
    archived: false,
    board_id: 'board-1',
    color: 'CYAN',
    created_at: '2026-05-01T00:00:00.000Z',
    creator_id: 'user-1',
    deleted: false,
    id: 'external-list',
    is_external_staging: true,
    name: 'External',
    position: 5,
    status: 'active',
  },
];

function task(overrides: Partial<TestTask>): TestTask {
  return {
    created_at: '2026-05-01T00:00:00.000Z',
    display_number: 1,
    id: 'task-1',
    list_id: 'active-list',
    name: 'Task',
    ...overrides,
  };
}

describe('buildKanbanDeadlineSections', () => {
  it('partitions overdue and upcoming tasks and sorts each section by due date', () => {
    const sections = buildKanbanDeadlineSections({
      deadlineTasks: [
        task({
          id: 'future-late',
          end_date: '2026-07-01T00:00:00.000Z',
        }),
        task({
          id: 'overdue-late',
          end_date: '2026-05-30T00:00:00.000Z',
        }),
        task({
          id: 'future-near',
          end_date: '2026-05-31T12:00:01.000Z',
        }),
        task({
          id: 'overdue-early',
          end_date: '2026-05-29T00:00:00.000Z',
        }),
      ],
      lists,
      now: NOW,
      visibleTasks: [],
    });

    expect(sections.overdue.map((item) => item.id)).toEqual([
      'overdue-early',
      'overdue-late',
    ]);
    expect(sections.upcoming.map((item) => item.id)).toEqual([
      'future-near',
      'future-late',
    ]);
  });

  it('keeps every future due-dated task in upcoming', () => {
    const sections = buildKanbanDeadlineSections({
      deadlineTasks: [
        task({ id: 'tomorrow', end_date: '2026-06-01T00:00:00.000Z' }),
        task({ id: 'next-quarter', end_date: '2026-08-31T00:00:00.000Z' }),
      ],
      lists,
      now: NOW,
      visibleTasks: [],
    });

    expect(sections.overdue).toEqual([]);
    expect(sections.upcoming.map((item) => item.id)).toEqual([
      'tomorrow',
      'next-quarter',
    ]);
  });

  it('excludes tasks without a valid due date', () => {
    const sections = buildKanbanDeadlineSections({
      deadlineTasks: [
        task({ id: 'missing-date' }),
        task({ id: 'invalid-date', end_date: 'not-a-date' }),
        task({ id: 'valid-date', end_date: '2026-06-01T00:00:00.000Z' }),
      ],
      lists,
      now: NOW,
      visibleTasks: [],
    });

    expect(sections.upcoming.map((item) => item.id)).toEqual(['valid-date']);
  });

  it('excludes deleted, resolved, completed, and closed tasks', () => {
    const sections = buildKanbanDeadlineSections({
      deadlineTasks: [
        task({ id: 'kept', end_date: '2026-06-01T00:00:00.000Z' }),
        task({
          id: 'deleted',
          deleted_at: '2026-05-31T00:00:00.000Z',
          end_date: '2026-06-01T00:00:00.000Z',
        }),
        task({
          id: 'completed-at',
          completed_at: '2026-05-31T00:00:00.000Z',
          end_date: '2026-06-01T00:00:00.000Z',
        }),
        task({
          id: 'completed-flag',
          completed: true,
          end_date: '2026-06-01T00:00:00.000Z',
        }),
        task({
          id: 'closed-at',
          closed_at: '2026-05-31T00:00:00.000Z',
          end_date: '2026-06-01T00:00:00.000Z',
        }),
        task({
          id: 'review-list-task',
          end_date: '2026-06-01T00:00:00.000Z',
          list_id: 'review-list',
        }),
        task({
          id: 'done-list-task',
          end_date: '2026-06-01T00:00:00.000Z',
          list_id: 'done-list',
        }),
        task({
          id: 'closed-list-task',
          end_date: '2026-06-01T00:00:00.000Z',
          list_id: 'closed-list',
        }),
        task({
          id: 'external-list-task',
          end_date: '2026-06-01T00:00:00.000Z',
          list_id: 'external-list',
        }),
        task({
          id: 'missing-list-task',
          end_date: '2026-06-01T00:00:00.000Z',
          list_id: 'missing-list',
        }),
      ],
      lists,
      now: NOW,
      visibleTasks: [],
    });

    expect(sections.upcoming.map((item) => item.id)).toEqual(['kept']);
  });

  it('lets currently visible optimistic tasks override fetched deadline tasks', () => {
    const sections = buildKanbanDeadlineSections({
      deadlineTasks: [
        task({ id: 'same-task', end_date: '2026-06-01T00:00:00.000Z' }),
        task({ id: 'fetched-only', end_date: '2026-06-02T00:00:00.000Z' }),
      ],
      lists,
      now: NOW,
      visibleTasks: [
        task({
          id: 'same-task',
          completed_at: '2026-05-31T00:00:00.000Z',
          end_date: '2026-06-01T00:00:00.000Z',
        }),
      ],
    });

    expect(sections.upcoming.map((item) => item.id)).toEqual(['fetched-only']);
  });
});
