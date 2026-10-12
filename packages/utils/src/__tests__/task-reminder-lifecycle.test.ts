import { describe, expect, it } from 'vitest';
import {
  getTaskReminderLifecycleSkipReason,
  type TaskReminderState,
} from '../task-reminder-lifecycle';

const due = '2026-10-13T12:00:00Z';
const current: TaskReminderState = {
  end_date: due,
  completed_at: null,
  closed_at: null,
  deleted_at: null,
  listStatus: 'active',
  recipientWatching: true,
};

describe('task reminder revision and cancellation policy', () => {
  it('admits an unchanged watched task and equivalent timezone instants', () => {
    expect(getTaskReminderLifecycleSkipReason(current, due)).toBeNull();
    expect(
      getTaskReminderLifecycleSkipReason(current, '2026-10-13T19:00:00+07:00')
    ).toBeNull();
  });
  it('rejects an edited deadline without mutating the historical snapshot', () => {
    const snapshot = structuredClone(current);
    expect(
      getTaskReminderLifecycleSkipReason(current, '2026-10-12T12:00:00Z')
    ).toBe('skipped: task_reminder_revised');
    expect(current).toEqual(snapshot);
  });
  it.each([
    { end_date: null },
    { completed_at: due },
    { closed_at: due },
    { deleted_at: due },
    { listStatus: 'review' },
    { listStatus: 'done' },
    { listStatus: 'closed' },
  ])('cancels an ineligible task %j', (patch) => {
    expect(
      getTaskReminderLifecycleSkipReason({ ...current, ...patch }, due)
    ).toBe('skipped: task_reminder_canceled');
  });
  it('rejects a removed recipient, but preserves active workflow statuses', () => {
    expect(
      getTaskReminderLifecycleSkipReason(
        { ...current, recipientWatching: false },
        due
      )
    ).toBe('skipped: task_reminder_unwatched');
    for (const listStatus of ['documents', 'not_started', 'active', null]) {
      expect(
        getTaskReminderLifecycleSkipReason({ ...current, listStatus }, due)
      ).toBeNull();
    }
  });
  it('does not invent a terminal outcome for invalid dates', () => {
    expect(() =>
      getTaskReminderLifecycleSkipReason(current, 'invalid')
    ).toThrow('invalid');
    expect(() =>
      getTaskReminderLifecycleSkipReason(
        { ...current, end_date: 'invalid' },
        due
      )
    ).toThrow('invalid');
  });
});
