import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import type { TaskBoardStatus } from '@tuturuuu/types/primitives/TaskBoard';

export const TASK_BOARD_STATUSES = [
  'documents',
  'not_started',
  'active',
  'review',
  'done',
  'closed',
] as const satisfies readonly TaskBoardStatus[];

export const TASK_BOARD_WORKFLOW_STATUSES = [
  'not_started',
  'active',
  'review',
  'done',
  'closed',
] as const satisfies readonly TaskBoardStatus[];

export function isTaskBoardStatus(
  status: string | null | undefined
): status is TaskBoardStatus {
  return TASK_BOARD_STATUSES.includes(status as TaskBoardStatus);
}

export function isTaskBoardCompletedStatus(status: string | null | undefined) {
  return status === 'review' || status === 'done';
}

export function isTaskBoardResolvedStatus(status: string | null | undefined) {
  return isTaskBoardCompletedStatus(status) || status === 'closed';
}

export function isTaskBoardTerminalStatus(status: string | null | undefined) {
  return status === 'done' || status === 'closed';
}

export function getDefaultTaskListColorForStatus(
  status: string | null | undefined
): SupportedColor {
  switch (status) {
    case 'documents':
      return 'CYAN';
    case 'not_started':
      return 'GRAY';
    case 'active':
      return 'BLUE';
    case 'review':
      return 'ORANGE';
    case 'done':
      return 'GREEN';
    case 'closed':
      return 'PURPLE';
    default:
      return 'GRAY';
  }
}
