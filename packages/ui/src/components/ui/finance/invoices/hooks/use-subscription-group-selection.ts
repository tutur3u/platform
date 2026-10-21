import { type Dispatch, type SetStateAction, useEffect, useRef } from 'react';

export function useSubscriptionGroupSelection({
  wsId,
  userId,
  selectedGroupIds,
  groupsWithScheduleIds,
  loading,
  onChange,
}: {
  wsId: string;
  userId: string;
  selectedGroupIds: string[];
  groupsWithScheduleIds: string[];
  loading: boolean;
  onChange: Dispatch<SetStateAction<string[]>>;
}) {
  const editedScope = useRef<{ wsId: string; userId: string } | null>(null);
  useEffect(() => {
    if (
      editedScope.current?.wsId !== wsId ||
      editedScope.current?.userId !== userId
    ) {
      editedScope.current = null;
    }
  }, [wsId, userId]);

  useEffect(() => {
    if (
      (editedScope.current?.wsId !== wsId ||
        editedScope.current?.userId !== userId) &&
      userId &&
      !loading &&
      groupsWithScheduleIds.length > 0 &&
      selectedGroupIds.length === 0
    ) {
      onChange(groupsWithScheduleIds);
    }
  }, [
    groupsWithScheduleIds,
    loading,
    onChange,
    selectedGroupIds.length,
    userId,
    wsId,
  ]);

  const change = (selection: SetStateAction<string[]>) => {
    editedScope.current = { wsId, userId };
    onChange(selection);
  };
  return {
    toggle: (id: string) =>
      change((previous) =>
        previous.includes(id)
          ? previous.filter((selected) => selected !== id)
          : [...previous, id]
      ),
    selectAll: () => change(groupsWithScheduleIds),
    deselectAll: () => change([]),
  };
}
