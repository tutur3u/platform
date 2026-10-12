import { isTaskBoardResolvedStatus } from './task-list-status';

export type TaskReminderState = {
  end_date: string | null;
  completed_at: string | null;
  closed_at: string | null;
  deleted_at: string | null;
  listStatus: string | null;
  recipientWatching: boolean;
};

export type TaskReminderSkipReason =
  | 'skipped: task_reminder_canceled'
  | 'skipped: task_reminder_revised'
  | 'skipped: task_reminder_unwatched';

/** Compare instants so equivalent timezone representations retain their revision. */
export function getTaskReminderLifecycleSkipReason(
  current: TaskReminderState,
  scheduledEndDate: string
): TaskReminderSkipReason | null {
  const scheduledAt = Date.parse(scheduledEndDate);
  if (!Number.isFinite(scheduledAt)) {
    throw new Error('Scheduled task reminder due date invalid');
  }
  if (
    current.end_date === null ||
    current.completed_at ||
    current.closed_at ||
    current.deleted_at ||
    isTaskBoardResolvedStatus(current.listStatus)
  ) {
    return 'skipped: task_reminder_canceled';
  }
  const currentAt = Date.parse(current.end_date);
  if (!Number.isFinite(currentAt)) {
    throw new Error('Current task reminder due date invalid');
  }
  if (currentAt !== scheduledAt) return 'skipped: task_reminder_revised';
  if (!current.recipientWatching) return 'skipped: task_reminder_unwatched';
  return null;
}
