import { describe, expect, it } from 'vitest';
import { shouldBlockSafeApply } from '../schedule-apply-policy';

describe('shouldBlockSafeApply', () => {
  it('allows safe apply when there are no warnings or unscheduled items', () => {
    expect(
      shouldBlockSafeApply({
        warnings: [],
        summary: {
          totalEvents: 4,
          habitsScheduled: 1,
          tasksScheduled: 3,
          partiallyScheduledTasks: 0,
          unscheduledTasks: 0,
        },
      })
    ).toBeNull();
  });

  it('blocks safe apply when tasks remain unscheduled', () => {
    expect(
      shouldBlockSafeApply({
        warnings: [],
        summary: {
          totalEvents: 2,
          habitsScheduled: 1,
          tasksScheduled: 1,
          partiallyScheduledTasks: 0,
          unscheduledTasks: 1,
        },
      })
    ).toEqual({
      reason: 'unscheduled_tasks',
      warningCount: 0,
    });
  });

  it('blocks safe apply when preview warnings are present', () => {
    expect(
      shouldBlockSafeApply({
        warnings: ['No available slot for habit'],
        summary: {
          totalEvents: 2,
          habitsScheduled: 1,
          tasksScheduled: 1,
          partiallyScheduledTasks: 0,
          unscheduledTasks: 0,
        },
      })
    ).toEqual({
      reason: 'warnings_present',
      warningCount: 1,
    });
  });
});
