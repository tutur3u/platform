import type { TaskSortKeyRepair } from './task-drag-types';

export function getPendingTaskIdsForDrop({
  activeTaskId,
  repairedTaskSortKeys = [],
}: {
  activeTaskId: string;
  repairedTaskSortKeys?: TaskSortKeyRepair[];
}) {
  return Array.from(
    new Set([
      activeTaskId,
      ...repairedTaskSortKeys.map((repair) => repair.taskId),
    ])
  );
}

export function addPendingTaskIds(
  currentTaskIds: Set<string>,
  taskIds: Iterable<string>
) {
  const nextTaskIds = new Set(currentTaskIds);

  for (const taskId of taskIds) {
    nextTaskIds.add(taskId);
  }

  return nextTaskIds;
}

export function removePendingTaskIds(
  currentTaskIds: Set<string>,
  taskIds: Iterable<string>
) {
  const nextTaskIds = new Set(currentTaskIds);

  for (const taskId of taskIds) {
    nextTaskIds.delete(taskId);
  }

  return nextTaskIds;
}
