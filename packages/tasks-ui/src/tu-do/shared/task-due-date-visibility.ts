import type { TaskBoardStatus } from '@tuturuuu/types/primitives/TaskBoard';
import { isTaskBoardTerminalStatus } from '@tuturuuu/utils/task-list-status';

export const TASKS_SHOW_REVIEW_DUE_DATES_CONFIG_ID =
  'TASKS_SHOW_REVIEW_DUE_DATES';

export function shouldShowTaskDueDate({
  completedAt,
  closedAt,
  dueDate,
  listStatus,
  showReviewDueDates,
}: {
  completedAt?: string | null;
  closedAt?: string | null;
  dueDate?: string | null;
  listStatus?: TaskBoardStatus | string | null;
  showReviewDueDates: boolean;
}) {
  if (!dueDate || completedAt || closedAt) return false;
  if (listStatus === 'review') return showReviewDueDates;
  return !isTaskBoardTerminalStatus(listStatus);
}

export function shouldShowTaskStartDate({
  completedAt,
  closedAt,
  listStatus,
  startDate,
}: {
  completedAt?: string | null;
  closedAt?: string | null;
  listStatus?: TaskBoardStatus | string | null;
  startDate?: string | null;
}) {
  if (!startDate || completedAt || closedAt) return false;
  return listStatus !== 'review' && !isTaskBoardTerminalStatus(listStatus);
}
