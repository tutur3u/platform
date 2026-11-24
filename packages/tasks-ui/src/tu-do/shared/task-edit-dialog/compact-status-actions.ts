import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';

interface CompactStatusActionsInput {
  availableLists?: TaskList[];
  selectedListId: string;
  task?: Task;
  isCreateMode: boolean;
  disabled: boolean;
  taskLoadError: boolean;
  isLoading: boolean;
  isHydratingTask: boolean;
}

/** Which one-click Done / Cancel / Archive actions the compact dialog offers. */
export function getCompactStatusActions({
  availableLists,
  selectedListId,
  task,
  isCreateMode,
  disabled,
  taskLoadError,
  isLoading,
  isHydratingTask,
}: CompactStatusActionsInput) {
  const currentList = availableLists?.find(
    (list) => list.id === selectedListId
  );
  const doneList = availableLists?.find(
    (list) => list.status === 'done' && !list.deleted
  );
  const closedList = availableLists?.find(
    (list) => list.status === 'closed' && !list.deleted
  );
  const isDeletedTask = Boolean(
    task?.deleted_at ||
    (task as (Task & { deleted?: boolean }) | undefined)?.deleted
  );
  const canShowCompactEditActions =
    !isCreateMode &&
    !!task?.id &&
    task.id !== 'new' &&
    !isDeletedTask &&
    !disabled &&
    !taskLoadError;
  const isDocumentTask = currentList?.status === 'documents';
  const canShowCompactStatusActions =
    canShowCompactEditActions && !isDocumentTask;
  const canShowArchiveAction =
    canShowCompactEditActions &&
    !!closedList &&
    closedList.id !== selectedListId &&
    currentList?.status !== 'closed';

  return {
    doneList,
    closedList,
    canShowCompactEditActions,
    compactEditActionsDisabled: isLoading || isHydratingTask,
    showCompactDoneAction:
      canShowCompactStatusActions &&
      !!doneList &&
      doneList.id !== selectedListId &&
      currentList?.status !== 'done',
    showCompactClosedAction:
      canShowCompactStatusActions &&
      !!closedList &&
      closedList.id !== selectedListId &&
      closedList.id !== doneList?.id &&
      currentList?.status !== 'closed',
    showDocumentArchiveAction: canShowArchiveAction && isDocumentTask,
  };
}
