import { describe, expect, it } from 'vitest';
import { shouldSkipDeadlineReminderTask } from './route';

describe('shouldSkipDeadlineReminderTask', () => {
  const baseTask = {
    closed_at: null,
    completed_at: null,
    task_lists: {
      status: 'todo',
    },
  };

  it('skips tasks with closed_at', () => {
    expect(
      shouldSkipDeadlineReminderTask({
        ...baseTask,
        closed_at: '2026-03-28T00:00:00.000Z',
      })
    ).toBe(true);
  });

  it('skips tasks with completed_at', () => {
    expect(
      shouldSkipDeadlineReminderTask({
        ...baseTask,
        completed_at: '2026-03-28T00:00:00.000Z',
      })
    ).toBe(true);
  });

  it('skips tasks in done lists', () => {
    expect(
      shouldSkipDeadlineReminderTask({
        ...baseTask,
        task_lists: { status: 'done' },
      })
    ).toBe(true);
  });

  it('skips tasks in closed lists', () => {
    expect(
      shouldSkipDeadlineReminderTask({
        ...baseTask,
        task_lists: { status: 'closed' },
      })
    ).toBe(true);
  });

  it('keeps active tasks eligible for reminders', () => {
    expect(shouldSkipDeadlineReminderTask(baseTask)).toBe(false);
  });
});
