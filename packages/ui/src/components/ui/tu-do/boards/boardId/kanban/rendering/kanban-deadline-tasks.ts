import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';

export interface KanbanDeadlineSections {
  overdue: Task[];
  upcoming: Task[];
}

interface DeadlineTask extends Task {
  completed?: boolean | null;
}

interface BuildKanbanDeadlineSectionsOptions {
  deadlineTasks: Task[];
  visibleTasks: Task[];
  lists: TaskList[];
  now?: Date;
}

const OPEN_DEADLINE_LIST_STATUSES = new Set(['not_started', 'active']);

function getValidDateTime(value: string | null | undefined) {
  if (!value) return null;

  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function compareDeadlineTasks(a: Task, b: Task) {
  const aDueTime = getValidDateTime(a.end_date);
  const bDueTime = getValidDateTime(b.end_date);

  if (aDueTime !== null && bDueTime !== null && aDueTime !== bDueTime) {
    return aDueTime - bDueTime;
  }

  const aCreatedTime = getValidDateTime(a.created_at);
  const bCreatedTime = getValidDateTime(b.created_at);

  if (
    aCreatedTime !== null &&
    bCreatedTime !== null &&
    aCreatedTime !== bCreatedTime
  ) {
    return aCreatedTime - bCreatedTime;
  }

  return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

function isEligibleDeadlineTask(
  task: DeadlineTask,
  eligibleListIds: Set<string>
) {
  return (
    eligibleListIds.has(task.list_id) &&
    !task.deleted_at &&
    !task.completed_at &&
    task.completed !== true &&
    !task.closed_at &&
    getValidDateTime(task.end_date) !== null
  );
}

export function buildKanbanDeadlineSections({
  deadlineTasks,
  visibleTasks,
  lists,
  now = new Date(),
}: BuildKanbanDeadlineSectionsOptions): KanbanDeadlineSections {
  const eligibleListIds = new Set(
    lists
      .filter(
        (list) =>
          !list.deleted &&
          !list.archived &&
          !list.is_external_staging &&
          OPEN_DEADLINE_LIST_STATUSES.has(list.status)
      )
      .map((list) => list.id)
  );
  const mergedTasks = new Map<string, DeadlineTask>();

  for (const task of deadlineTasks as DeadlineTask[]) {
    mergedTasks.set(task.id, task);
  }

  for (const task of visibleTasks as DeadlineTask[]) {
    mergedTasks.set(task.id, task);
  }

  const nowTime = now.getTime();
  const overdue: Task[] = [];
  const upcoming: Task[] = [];

  for (const task of mergedTasks.values()) {
    if (!isEligibleDeadlineTask(task, eligibleListIds)) continue;

    const dueTime = getValidDateTime(task.end_date);
    if (dueTime === null) continue;

    if (dueTime < nowTime) {
      overdue.push(task);
    } else {
      upcoming.push(task);
    }
  }

  overdue.sort(compareDeadlineTasks);
  upcoming.sort(compareDeadlineTasks);

  return { overdue, upcoming };
}
