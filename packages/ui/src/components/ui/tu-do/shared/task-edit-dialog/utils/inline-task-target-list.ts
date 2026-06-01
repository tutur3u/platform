import type { TaskList } from '@tuturuuu/types/primitives/TaskList';

interface ResolveInlineTaskTargetListOptions {
  availableLists?: TaskList[];
  preferredListId?: string | null;
}

function isWritableInlineTaskList(list: TaskList) {
  return !list.deleted && !list.is_external_staging;
}

export function resolveInlineTaskTargetList({
  availableLists,
  preferredListId,
}: ResolveInlineTaskTargetListOptions): TaskList | null {
  const lists = availableLists ?? [];

  if (preferredListId) {
    const preferredList = lists.find((list) => list.id === preferredListId);

    if (preferredList && isWritableInlineTaskList(preferredList)) {
      return preferredList;
    }
  }

  return lists.find(isWritableInlineTaskList) ?? null;
}
