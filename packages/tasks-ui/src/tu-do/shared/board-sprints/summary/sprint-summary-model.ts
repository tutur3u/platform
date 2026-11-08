import type {
  BoardSprint,
  BoardSprintReport,
} from '@tuturuuu/internal-api/task-sprints';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { isTaskFinished } from '@tuturuuu/utils/task-helper/sprints';

/** Done out of all tasks, live for a running sprint or stored for an ended one. */
export interface SprintSummaryNumbers {
  doneTasks: number;
  totalTasks: number;
}

/** Same rules as end_board_sprint, so the live view matches the stored report. */
export function buildLiveSprintSummary(
  sprint: Pick<BoardSprint, 'tasks'>,
  tasksById: ReadonlyMap<string, Task>
): SprintSummaryNumbers {
  let doneTasks = 0;
  let totalTasks = 0;
  for (const entry of sprint.tasks) {
    const task = tasksById.get(entry.task_id);
    // Deleted tasks drop out of the report, as they do on the server.
    if (!task || task.deleted_at) continue;
    totalTasks += 1;
    if (isTaskFinished(task)) doneTasks += 1;
  }
  return { doneTasks, totalTasks };
}

export function summaryFromReport(
  report: Pick<BoardSprintReport, 'done_tasks' | 'total_tasks'>
): SprintSummaryNumbers {
  return { doneTasks: report.done_tasks, totalTasks: report.total_tasks };
}

/** Open tasks of a sprint; ending moves them to the next sprint. */
export function getUnfinishedSprintTasks(
  sprint: Pick<BoardSprint, 'tasks'>,
  tasksById: ReadonlyMap<string, Task>
) {
  return sprint.tasks.flatMap((entry) => {
    const task = tasksById.get(entry.task_id);
    return task && !task.deleted_at && !isTaskFinished(task) ? [task] : [];
  });
}

/** Open tasks per status column, in board order. */
export function groupTasksByList(tasks: Task[], lists: TaskList[]) {
  const groups = lists.flatMap((list) => {
    const inList = tasks.filter((task) => task.list_id === list.id);
    return inList.length ? [{ list, tasks: inList }] : [];
  });
  const known = new Set(lists.map((list) => list.id));
  const other = tasks.filter((task) => !known.has(task.list_id));
  return other.length ? [...groups, { list: null, tasks: other }] : groups;
}
