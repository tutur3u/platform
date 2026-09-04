'use client';

import { useUserConfig } from '@tuturuuu/ui/hooks/use-user-config';
import {
  TASK_AUTO_COLLAPSE_EMPTY_LISTS_CONFIG_ID,
  TASK_HIDE_EMPTY_LISTS_CONFIG_ID,
  TASK_PERSIST_COLLAPSED_LISTS_CONFIG_ID,
} from './task-board-preferences';

export function useTaskBoardListPreferences(localTaskState: boolean) {
  const options = { enabled: !localTaskState };
  const { data: persistRaw, isPending: persistPending } = useUserConfig(
    TASK_PERSIST_COLLAPSED_LISTS_CONFIG_ID,
    'true',
    options
  );
  const { data: hideEmptyRaw, isPending: hideEmptyPending } = useUserConfig(
    TASK_HIDE_EMPTY_LISTS_CONFIG_ID,
    'false',
    options
  );
  const { data: autoCollapseRaw, isPending: autoCollapsePending } =
    useUserConfig(TASK_AUTO_COLLAPSE_EMPTY_LISTS_CONFIG_ID, 'false', options);

  return {
    persistCollapsedTaskLists: !localTaskState && persistRaw !== 'false',
    hideEmptyTaskListsByDefault: !localTaskState && hideEmptyRaw === 'true',
    autoCollapseEmptyTaskLists: !localTaskState && autoCollapseRaw === 'true',
    taskBoardListPreferencesReady:
      localTaskState ||
      (!persistPending && !hideEmptyPending && !autoCollapsePending),
  };
}
