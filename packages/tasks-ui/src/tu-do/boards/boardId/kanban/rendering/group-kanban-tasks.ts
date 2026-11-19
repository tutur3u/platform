import type { Task } from '@tuturuuu/types/primitives/Task';
import { compareTasksByEffectiveSortKey } from '../dnd/task-sort-key';

interface KanbanListRef {
  id: string;
  status?: string | null;
}

function time(value?: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Groups board tasks by list in one pass. Done lists sort by completion and
 * closed lists by close time, most recent first; other lists keep the
 * effective sort key unless the caller already sorted them.
 */
export function groupKanbanTasks(
  tasks: Task[],
  lists: KanbanListRef[],
  disableSort: boolean
): Map<string, Task[]> {
  const byList = new Map<string, Task[]>();
  for (const list of lists) byList.set(list.id, []);
  for (const task of tasks) byList.get(task.list_id)?.push(task);

  for (const list of lists) {
    const listTasks = byList.get(list.id);
    if (!listTasks || listTasks.length < 2) continue;
    if (list.status === 'done' || list.status === 'closed') {
      const key = list.status === 'done' ? 'completed_at' : 'closed_at';
      const stamps = new Map(listTasks.map((t) => [t.id, time(t[key])]));
      listTasks.sort(
        (a, b) => (stamps.get(b.id) ?? 0) - (stamps.get(a.id) ?? 0)
      );
    } else if (!disableSort) {
      listTasks.sort(compareTasksByEffectiveSortKey);
    }
  }
  return byList;
}
