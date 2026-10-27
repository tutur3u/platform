import type { Task } from '@tuturuuu/types/primitives/Task';
import { useMemo } from 'react';
import { collectBoardPeople, countUnassignedTasks } from './board-filter-state';

/**
 * People and project counts for the header filters. They come from every
 * loaded board task, so pills stay put while the board is filtered.
 */
export function useBoardHeaderData(tasks: Task[], currentUserId?: string) {
  const people = useMemo(
    () => collectBoardPeople(tasks, currentUserId),
    [currentUserId, tasks]
  );
  const unassignedCount = useMemo(() => countUnassignedTasks(tasks), [tasks]);
  const projectTaskCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const task of tasks) {
      for (const project of task.projects ?? []) {
        counts.set(project.id, (counts.get(project.id) ?? 0) + 1);
      }
    }
    return counts;
  }, [tasks]);

  return { people, projectTaskCounts, unassignedCount };
}
