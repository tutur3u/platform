import type { Task } from '@tuturuuu/types/primitives/Task';
import { isPersonalExternalStagingListId } from '@tuturuuu/utils/task-helper';

function hasValue(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function isPersonalExternalOverlayTask(task?: Task | null) {
  if (!task) return false;

  if (task.is_personal_external === true) {
    return true;
  }

  if (task.is_personal_external === false) {
    return false;
  }

  if (isPersonalExternalStagingListId(task.list_id)) {
    return true;
  }

  const personalBoardId = hasValue(task.personal_board_id)
    ? task.personal_board_id
    : null;
  const personalListId = hasValue(task.personal_list_id)
    ? task.personal_list_id
    : null;

  if (!personalBoardId && !personalListId) {
    return false;
  }

  if (
    hasValue(task.source_board_id) &&
    personalBoardId &&
    task.source_board_id !== personalBoardId
  ) {
    return true;
  }

  return (
    !hasValue(task.source_board_id) &&
    hasValue(task.source_workspace_id) &&
    hasValue(task.source_list_id) &&
    personalListId !== null &&
    task.source_list_id !== personalListId
  );
}
