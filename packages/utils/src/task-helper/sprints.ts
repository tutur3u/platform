import type {
  BoardSprint,
  BoardSprintTask,
} from '@tuturuuu/internal-api/task-sprints';

type SprintLike = Pick<
  BoardSprint,
  'id' | 'name' | 'sequence_number' | 'status' | 'end_date'
> & {
  tasks: Pick<BoardSprintTask, 'task_id'>[];
};

type TaskTiming = {
  completed_at?: string | null;
  closed_at?: string | null;
  end_date?: string | null;
};

export function isBoardSprintOpen(sprint: Pick<BoardSprint, 'status'>) {
  return sprint.status === 'planned' || sprint.status === 'active';
}

/** The sprint the Board view shows: the running one, else the one being planned. */
export function getCurrentBoardSprint<T extends Pick<BoardSprint, 'status'>>(
  sprints: readonly T[]
): T | null {
  return (
    sprints.find((sprint) => sprint.status === 'active') ??
    sprints.find((sprint) => sprint.status === 'planned') ??
    null
  );
}

export function getPlanningBoardSprint<T extends Pick<BoardSprint, 'status'>>(
  sprints: readonly T[]
): T | null {
  return sprints.find((sprint) => sprint.status === 'planned') ?? null;
}

/** Maps each task to the open sprint it belongs to on this board. */
export function buildOpenSprintByTaskId<T extends SprintLike>(
  sprints: readonly T[]
): Map<string, T> {
  const byTaskId = new Map<string, T>();
  for (const sprint of sprints) {
    if (!isBoardSprintOpen(sprint)) continue;
    for (const task of sprint.tasks) {
      const existing = byTaskId.get(task.task_id);
      // A task sits in one open sprint; prefer the running one if data races.
      if (!existing || sprint.status === 'active') {
        byTaskId.set(task.task_id, sprint);
      }
    }
  }
  return byTaskId;
}

/** Sprint numbers a task went through, oldest first, including the current one. */
export function getTaskSprintHistory<T extends SprintLike>(
  sprints: readonly T[],
  taskId: string
): T[] {
  return sprints
    .filter((sprint) => sprint.tasks.some((task) => task.task_id === taskId))
    .sort((a, b) => a.sequence_number - b.sequence_number);
}

export function isTaskFinished(task: TaskTiming) {
  return Boolean(task.completed_at || task.closed_at);
}

export type TaskDueSource = 'own' | 'sprint';

/**
 * A card shows whichever applies: the task's own due date, or the sprint end.
 * The sprint end is never written into the task.
 */
export function getTaskEffectiveDueDate(
  task: TaskTiming,
  sprint?: Pick<BoardSprint, 'end_date'> | null
): { date: string; source: TaskDueSource } | null {
  if (task.end_date) return { date: task.end_date, source: 'own' };
  if (sprint?.end_date) return { date: sprint.end_date, source: 'sprint' };
  return null;
}

/** Only an own due date can make a task overdue; the sprint end never does. */
export function isTaskOverdueByOwnDate(task: TaskTiming, now = new Date()) {
  if (!task.end_date || isTaskFinished(task)) return false;
  const due = new Date(task.end_date);
  return Number.isFinite(due.getTime()) && due.getTime() < now.getTime();
}

/** Tasks done out of all tasks in a sprint, given which task ids are finished. */
export function getSprintProgress(
  sprint: Pick<SprintLike, 'tasks'>,
  isTaskDone: (taskId: string) => boolean
) {
  const total = sprint.tasks.length;
  const done = sprint.tasks.filter((task) => isTaskDone(task.task_id)).length;
  return {
    done,
    total,
    ratio: total === 0 ? 0 : done / total,
  };
}

/**
 * Whether the Board view shows a task while its board runs sprints: tasks of
 * the current sprint, and open tasks no open sprint holds yet (just created,
 * moved onto the board, restored or reopened), which the database has already
 * put in the current sprint, so they never vanish while the sprints refresh.
 * Hidden: tasks waiting in another open sprint, and finished tasks from past
 * sprints or from before sprints were on. A task created finished during the
 * running sprint shows too.
 */
export function isTaskInCurrentSprintView(
  task: TaskTiming & { id: string; created_at?: string | null },
  sprints: readonly Pick<SprintLike, 'status' | 'tasks'>[],
  current:
    | (Pick<SprintLike, 'status' | 'tasks'> & { started_at?: string | null })
    | null
) {
  if (!current) return true;
  if (current.tasks.some((member) => member.task_id === task.id)) return true;
  let inAnySprint = false;
  for (const sprint of sprints) {
    if (!sprint.tasks.some((member) => member.task_id === task.id)) continue;
    if (isBoardSprintOpen(sprint)) return false;
    inAnySprint = true;
  }
  if (!isTaskFinished(task)) return true;
  if (inAnySprint || !current.started_at || !task.created_at) return false;
  return Date.parse(task.created_at) >= Date.parse(current.started_at);
}

/**
 * Progress from live task state where a task is loaded, else from the
 * sprint's own record of it, so tasks on unloaded pages still count.
 */
export function getLoadedSprintProgress<T extends TaskTiming & { id: string }>(
  sprint: { tasks: { task_id: string; done?: boolean }[] },
  loadedTasks: ReadonlyMap<string, T>
) {
  return getSprintProgress(sprint, (taskId) => {
    const loaded = loadedTasks.get(taskId);
    return loaded
      ? isTaskFinished(loaded)
      : sprint.tasks.some((task) => task.task_id === taskId && task.done);
  });
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

/** Whole days from today to the sprint end date (negative once it has passed). */
export function getDaysUntilSprintEnd(
  sprint: Pick<BoardSprint, 'end_date'>,
  today = new Date()
) {
  if (!sprint.end_date) return null;
  const end = parseDateOnly(sprint.end_date);
  if (!end) return null;
  const start = Date.UTC(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );
  return Math.round((end.getTime() - start) / 86_400_000);
}

/** "19 Oct 2026 - 30 Oct 2026", in the viewer's locale; English is day first. */
export function formatSprintDateRange(
  sprint: Pick<BoardSprint, 'start_date' | 'end_date'>,
  locale?: string
) {
  const resolvedLocale =
    locale === 'en' || locale === 'en-US' ? 'en-GB' : locale;
  const format = (value: string | null) => {
    if (!value) return null;
    const date = parseDateOnly(value);
    if (!date) return null;
    return new Intl.DateTimeFormat(resolvedLocale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(date);
  };
  const start = format(sprint.start_date);
  const end = format(sprint.end_date);
  if (start && end) return `${start} - ${end}`;
  return start ?? end ?? '';
}

/** A sprint's dates without the year, for labels beside its name: "27 Oct – 6 Nov". */
export function formatSprintShortRange(
  sprint: Pick<BoardSprint, 'start_date' | 'end_date'>,
  locale?: string
) {
  const resolvedLocale =
    locale === 'en' || locale === 'en-US' ? 'en-GB' : locale;
  const start = sprint.start_date ? parseDateOnly(sprint.start_date) : null;
  const end = sprint.end_date ? parseDateOnly(sprint.end_date) : null;
  const format = new Intl.DateTimeFormat(resolvedLocale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
  if (start && end) return format.formatRange(start, end);
  const only = start ?? end;
  return only ? format.format(only) : '';
}
