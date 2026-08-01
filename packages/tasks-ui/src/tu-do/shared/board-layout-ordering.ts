import type { WorkspaceTaskList } from '@tuturuuu/types';
import type { TaskBoardStatus } from '@tuturuuu/types/primitives/TaskBoard';

export interface TaskListPositionUpdate {
  id: string;
  position: number;
  status?: TaskBoardStatus;
}

export interface ReorderedTaskLists {
  lists: WorkspaceTaskList[];
  updates: TaskListPositionUpdate[];
}

function byPosition(
  a: WorkspaceTaskList,
  b: WorkspaceTaskList,
  originalIndexes: Map<string, number>
) {
  const positionDifference = (a.position ?? 0) - (b.position ?? 0);
  if (positionDifference !== 0) return positionDifference;

  return (originalIndexes.get(a.id) ?? 0) - (originalIndexes.get(b.id) ?? 0);
}

function getDropStatus(
  lists: WorkspaceTaskList[],
  overId: string
): TaskBoardStatus | null {
  if (overId.startsWith('status:')) {
    return overId.slice('status:'.length) as TaskBoardStatus;
  }

  return lists.find((list) => list.id === overId)?.status ?? null;
}

export function reorderTaskLists(
  lists: WorkspaceTaskList[],
  activeId: string,
  overId: string
): ReorderedTaskLists | null {
  const activeList = lists.find((list) => list.id === activeId);
  const overList = lists.find((list) => list.id === overId);
  const targetStatus = getDropStatus(lists, overId);

  if (!activeList?.status || !targetStatus) {
    return null;
  }

  const originalIndexes = new Map(
    lists.map((list, index) => [list.id, index] as const)
  );
  const sourceStatus = activeList.status;
  const sourceLists = lists
    .filter((list) => list.status === activeList.status)
    .sort((a, b) => byPosition(a, b, originalIndexes));
  const oldIndex = sourceLists.findIndex((list) => list.id === activeId);

  if (oldIndex === -1) return null;

  const sourceWithoutMoved = [...sourceLists];
  const [movedList] = sourceWithoutMoved.splice(oldIndex, 1);
  if (!movedList) return null;

  if (sourceStatus === targetStatus) {
    const newIndex = sourceLists.findIndex((list) => list.id === overId);
    if (newIndex === -1) return null;
    sourceWithoutMoved.splice(newIndex, 0, movedList);
  }

  const sourceUpdates = sourceWithoutMoved.map((list, position) => ({
    id: list.id,
    position,
  }));

  let updates = sourceUpdates;
  if (sourceStatus !== targetStatus) {
    const targetLists = lists
      .filter((list) => list.status === targetStatus)
      .sort((a, b) => byPosition(a, b, originalIndexes));
    const targetIndex = overList
      ? targetLists.findIndex((list) => list.id === overList.id)
      : targetLists.length;
    const insertionIndex =
      targetIndex === -1 ? targetLists.length : targetIndex;
    targetLists.splice(insertionIndex, 0, {
      ...movedList,
      status: targetStatus,
    });
    updates = [
      ...sourceUpdates,
      ...targetLists.map((list, position) => ({
        id: list.id,
        position,
        ...(list.id === activeId ? { status: targetStatus } : {}),
      })),
    ];
  }

  const positionsById = new Map(
    updates.map((update) => [update.id, update] as const)
  );

  return {
    lists: lists.map((list) => {
      const update = positionsById.get(list.id);
      return update === undefined ? list : { ...list, ...update };
    }),
    updates,
  };
}
