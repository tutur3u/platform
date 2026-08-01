import type { WorkspaceTaskList } from '@tuturuuu/types';

export interface TaskListPositionUpdate {
  id: string;
  position: number;
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

export function reorderTaskListsWithinStatus(
  lists: WorkspaceTaskList[],
  activeId: string,
  overId: string
): ReorderedTaskLists | null {
  const activeList = lists.find((list) => list.id === activeId);
  const overList = lists.find((list) => list.id === overId);

  if (
    !activeList?.status ||
    !overList?.status ||
    activeList.status !== overList.status
  ) {
    return null;
  }

  const originalIndexes = new Map(
    lists.map((list, index) => [list.id, index] as const)
  );
  const statusLists = lists
    .filter((list) => list.status === activeList.status)
    .sort((a, b) => byPosition(a, b, originalIndexes));
  const oldIndex = statusLists.findIndex((list) => list.id === activeId);
  const newIndex = statusLists.findIndex((list) => list.id === overId);

  if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return null;

  const reordered = [...statusLists];
  const [movedList] = reordered.splice(oldIndex, 1);
  if (!movedList) return null;
  reordered.splice(newIndex, 0, movedList);

  const updates = reordered.map((list, position) => ({
    id: list.id,
    position,
  }));
  const positionsById = new Map(
    updates.map((update) => [update.id, update.position] as const)
  );

  return {
    lists: lists.map((list) => {
      const position = positionsById.get(list.id);
      return position === undefined ? list : { ...list, position };
    }),
    updates,
  };
}
