import { describe, expect, it } from 'vitest';
import {
  shouldShowTaskDueDate,
  shouldShowTaskStartDate,
} from './task-due-date-visibility';

describe('task due date visibility', () => {
  it('shows due dates for active workflow tasks', () => {
    expect(
      shouldShowTaskDueDate({
        dueDate: '2026-06-08T00:00:00.000Z',
        listStatus: 'active',
        showReviewDueDates: false,
      })
    ).toBe(true);
  });

  it('hides review due dates by default', () => {
    expect(
      shouldShowTaskDueDate({
        dueDate: '2026-06-08T00:00:00.000Z',
        listStatus: 'review',
        showReviewDueDates: false,
      })
    ).toBe(false);
  });

  it('shows review due dates when the setting is enabled', () => {
    expect(
      shouldShowTaskDueDate({
        dueDate: '2026-06-08T00:00:00.000Z',
        listStatus: 'review',
        showReviewDueDates: true,
      })
    ).toBe(true);
  });

  it('keeps terminal and completed tasks hidden', () => {
    expect(
      shouldShowTaskDueDate({
        dueDate: '2026-06-08T00:00:00.000Z',
        listStatus: 'done',
        showReviewDueDates: true,
      })
    ).toBe(false);
    expect(
      shouldShowTaskDueDate({
        closedAt: '2026-06-08T00:00:00.000Z',
        dueDate: '2026-06-08T00:00:00.000Z',
        listStatus: 'active',
        showReviewDueDates: true,
      })
    ).toBe(false);
    expect(
      shouldShowTaskDueDate({
        completedAt: '2026-06-08T00:00:00.000Z',
        dueDate: '2026-06-08T00:00:00.000Z',
        listStatus: 'review',
        showReviewDueDates: true,
      })
    ).toBe(false);
  });

  it('does not use the review due-date setting for start dates', () => {
    expect(
      shouldShowTaskStartDate({
        listStatus: 'review',
        startDate: '2026-06-08T00:00:00.000Z',
      })
    ).toBe(false);
  });
});
