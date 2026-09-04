import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { isPersonalExternalOverlayTask } from '@tuturuuu/ui/lib/task-personal-external';
import { getPersonalExternalStagingBoardId } from '@tuturuuu/utils/task-helper';

export function usesPersonalPlacement(task: Task) {
  return isPersonalExternalOverlayTask(task);
}

export function getPersonalPlacementTargetBoardId({
  boardId,
  columns,
  targetListId,
}: {
  boardId: string | null;
  columns: Pick<TaskList, 'board_id' | 'id'>[];
  targetListId: string;
}) {
  const stagingBoardId = getPersonalExternalStagingBoardId(targetListId);
  if (stagingBoardId) return stagingBoardId;

  return (
    columns.find((column) => column.id === targetListId)?.board_id ?? boardId
  );
}

export function shouldPersistTaskDropDirectly(
  activeUsesPersonalPlacement: boolean,
  repairedTaskSortKeyCount: number,
  targetIsExternalStaging: boolean
) {
  return (
    (activeUsesPersonalPlacement || targetIsExternalStaging) &&
    repairedTaskSortKeyCount === 0
  );
}
