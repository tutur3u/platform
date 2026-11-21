'use client';

import { type MutableRefObject, type ReactNode, useMemo } from 'react';
import { TaskRecurrenceBadge } from '../../../shared/task-recurrence/task-recurrence-badge';
import { useTaskRecurrenceEntry } from '../../../shared/task-recurrence/use-task-recurrence';

/** The card's recurrence badge for the overflow-measured badge row, or null
 * when the task is not in a series the reader may see. */
export function useRecurrenceBadge(
  wsId: string | undefined,
  taskId: string,
  badgeRefs: MutableRefObject<Map<string, HTMLDivElement>>
): { id: string; element: ReactNode } | null {
  const entry = useTaskRecurrenceEntry(wsId, taskId);
  const state = entry?.state;
  return useMemo(
    () =>
      state
        ? {
            id: 'recurrence',
            element: (
              <TaskRecurrenceBadge
                key="recurrence"
                state={state}
                ref={(el) => {
                  if (el)
                    badgeRefs.current.set(
                      'recurrence',
                      el as unknown as HTMLDivElement
                    );
                }}
              />
            ),
          }
        : null,
    [state, badgeRefs]
  );
}
