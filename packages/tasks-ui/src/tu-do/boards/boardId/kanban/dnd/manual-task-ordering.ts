type DragData = {
  columnId?: unknown;
  task?: {
    id?: unknown;
    list_id?: unknown;
  };
  type?: unknown;
};

interface ManualTaskOrderingDrop {
  activeData?: DragData;
  criteriaSortingActive: boolean;
  overData?: DragData;
  overId?: unknown;
  preview?: {
    listId: string;
    taskId: string;
  } | null;
}

function getTargetListId({
  activeTaskId,
  overData,
  overId,
  preview,
}: {
  activeTaskId: string;
  overData?: DragData;
  overId?: unknown;
  preview?: ManualTaskOrderingDrop['preview'];
}) {
  if (preview?.taskId === activeTaskId) return preview.listId;

  if (overData?.type === 'Task' && overData.task?.list_id != null) {
    return String(overData.task.list_id);
  }

  if (overData?.type === 'Column' && overId != null) {
    return String(overId);
  }

  if (overData?.type === 'ColumnSurface') {
    const columnId = overData.columnId ?? overId;
    return columnId == null ? null : String(columnId);
  }

  return null;
}

export function shouldBlockManualTaskOrdering({
  activeData,
  criteriaSortingActive,
  overData,
  overId,
  preview,
}: ManualTaskOrderingDrop) {
  if (!criteriaSortingActive || activeData?.type !== 'Task') return false;

  const activeTask = activeData.task;
  if (activeTask?.id == null || activeTask.list_id == null) return false;

  const targetListId = getTargetListId({
    activeTaskId: String(activeTask.id),
    overData,
    overId,
    preview,
  });

  return targetListId === String(activeTask.list_id);
}
