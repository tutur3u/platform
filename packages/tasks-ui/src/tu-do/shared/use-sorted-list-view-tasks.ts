'use client';

import type { Task } from '@tuturuuu/types/primitives/Task';
import { useUserConfig } from '@tuturuuu/ui/hooks/use-user-config';
import {
  normalizeUnprioritizedPosition,
  TASK_UNPRIORITIZED_POSITION_CONFIG_ID,
} from '@tuturuuu/utils/task-helper';
import { useMemo } from 'react';
import { sortListViewTasks } from './list-view-sorting';

export function useSortedListViewTasks(
  tasks: Task[],
  options: Parameters<typeof sortListViewTasks>[1],
  readOnly = false
) {
  const { data } = useUserConfig(
    TASK_UNPRIORITIZED_POSITION_CONFIG_ID,
    'first',
    { enabled: !readOnly }
  );
  const { preserveTaskOrder, searchQuery, sortField, sortOrder } = options;
  return useMemo(
    () =>
      sortListViewTasks(tasks, {
        preserveTaskOrder,
        searchQuery,
        sortField,
        sortOrder,
        unprioritizedPosition: normalizeUnprioritizedPosition(data),
      }),
    [tasks, preserveTaskOrder, searchQuery, sortField, sortOrder, data]
  );
}
