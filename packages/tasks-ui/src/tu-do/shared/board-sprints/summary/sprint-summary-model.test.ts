import type { BoardSprint } from '@tuturuuu/internal-api/task-sprints';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { describe, expect, it } from 'vitest';
import {
  buildLiveSprintSummary,
  countMissingDecisions,
  getDeliveredPercent,
  getUnfinishedSprintTasks,
  setAllDecisions,
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
    const numbers = buildLiveSprintSummary(sprint, tasksById);
    expect(numbers).toMatchObject({
      committedPoints: 8,
      donePoints: 5,
      addedPoints: 2,
      addedTasks: 1,
      committedTasks: 2,
      doneTasks: 2,
      totalTasks: 3,
      carriedIn: 1,
      usesPoints: true,
    });
    expect(numbers.people).toEqual([
      {
        userId: 'u1',
        doneTasks: 1,
        totalTasks: 2,
        donePoints: 3,
        totalPoints: 8,
      },
      {
        userId: 'u2',
        doneTasks: 0,
        totalTasks: 1,
        donePoints: 0,
        totalPoints: 5,
      },
    ]);
    expect(getDeliveredPercent(numbers)).toBe(63);
  });

  it('counts tasks instead of points when nothing is estimated', () => {
    const plain = new Map(
      [task('x', { completed_at: '2026-10-20' }), task('y')].map((t) => [
        t.id,
        t,
      ])
    );
    const numbers = buildLiveSprintSummary(
      { tasks: [entry('x'), entry('y')] },
      plain
    );
    expect(numbers.usesPoints).toBe(false);
    expect(getDeliveredPercent(numbers)).toBe(50);
  });
});

describe('summaryFromReport', () => {
  it('reads the stored report', () => {
    const numbers = summaryFromReport({
      ended_at: '2026-10-30T17:00:00Z',
      ended_by: null,
      next_cycle_id: null,
      goal: 'Ship',
      goal_result: 'met',
      total_tasks: 14,
      done_tasks: 12,
      added_tasks: 2,
      carried_in_tasks: 1,
      carried_tasks: 1,
      backlog_tasks: 1,
      committed_points: 34,
      done_points: 31,
      added_points: 4,
      people: [
        {
          user_id: 'u1',
          total_tasks: 4,
          done_tasks: 3,
          total_points: 11,
          done_points: 10,
        },
      ],
    });
    expect(numbers.committedTasks).toBe(12);
    expect(getDeliveredPercent(numbers)).toBe(91);
    expect(numbers.people[0]).toEqual({
      userId: 'u1',
      doneTasks: 3,
      totalTasks: 4,
      donePoints: 10,
      totalPoints: 11,
    });
  });
});

describe('end decisions', () => {
  it('needs a decision for every open task', () => {
    const open = getUnfinishedSprintTasks(sprint, tasksById).map(
      ({ task }) => task.id
    );
    expect(open).toEqual(['b']);
    expect(countMissingDecisions(open, {})).toBe(1);
    expect(countMissingDecisions(open, setAllDecisions(open, 'carry'))).toBe(0);
  });
});
