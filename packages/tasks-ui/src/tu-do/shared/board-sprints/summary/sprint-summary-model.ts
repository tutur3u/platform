import type {
  BoardSprint,
  BoardSprintEndDecision,
  BoardSprintReport,
} from '@tuturuuu/internal-api/task-sprints';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { isTaskFinished } from '@tuturuuu/utils/task-helper/sprints';

export interface SprintSummaryPerson {
  userId: string;
  doneTasks: number;
  totalTasks: number;
  donePoints: number;
  totalPoints: number;
}

/** The numbers a sprint summary shows, live for a running sprint or stored for an ended one. */
export interface SprintSummaryNumbers {
  committedPoints: number;
  donePoints: number;
  addedPoints: number;
  addedTasks: number;
  committedTasks: number;
  doneTasks: number;
  totalTasks: number;
  carriedIn: number;
  people: SprintSummaryPerson[];
  /** Estimates exist, so totals read in points; otherwise in tasks. */
  usesPoints: boolean;
}

export type SprintEndDecisions = Record<string, BoardSprintEndDecision>;

const points = (task: Task) => task.estimation_points ?? 0;

/** Same rules as end_board_sprint, so the live view matches the stored report. */
export function buildLiveSprintSummary(
  sprint: Pick<BoardSprint, 'tasks'>,
  tasksById: ReadonlyMap<string, Task>
): SprintSummaryNumbers {
  let committedPoints = 0;
  let donePoints = 0;
  let addedPoints = 0;
  let addedTasks = 0;
  let doneTasks = 0;
  let carriedIn = 0;
  let totalTasks = 0;
  const people = new Map<string, SprintSummaryPerson>();

  for (const entry of sprint.tasks) {
    const task = tasksById.get(entry.task_id);
    // Deleted tasks drop out of the report, as they do on the server.
    if (!task || task.deleted_at) continue;
    const value = points(task);
    const done = isTaskFinished(task);
    totalTasks += 1;

    if (entry.added_after_start) {
      addedPoints += value;
      addedTasks += 1;
    } else {
      committedPoints += value;
    }
    if (entry.carry_count > 0) carriedIn += 1;
    if (done) {
      donePoints += value;
      doneTasks += 1;
    }

    for (const assignee of task.assignees ?? []) {
      const person = people.get(assignee.id) ?? {
        userId: assignee.id,
        doneTasks: 0,
        totalTasks: 0,
        donePoints: 0,
        totalPoints: 0,
      };
      person.totalTasks += 1;
      person.totalPoints += value;
      if (done) {
        person.doneTasks += 1;
        person.donePoints += value;
      }
      people.set(assignee.id, person);
    }
  }

  return {
    committedPoints,
    donePoints,
    addedPoints,
    addedTasks,
    committedTasks: totalTasks - addedTasks,
    doneTasks,
    totalTasks,
    carriedIn,
    people: [...people.values()],
    usesPoints: committedPoints + addedPoints > 0,
  };
}

export function summaryFromReport(
  report: BoardSprintReport
): SprintSummaryNumbers {
  return {
    committedPoints: report.committed_points,
    donePoints: report.done_points,
    addedPoints: report.added_points,
    addedTasks: report.added_tasks,
    committedTasks: report.total_tasks - report.added_tasks,
    doneTasks: report.done_tasks,
    totalTasks: report.total_tasks,
    carriedIn: report.carried_in_tasks,
    people: report.people.map((person) => ({
      userId: person.user_id,
      doneTasks: person.done_tasks,
      totalTasks: person.total_tasks,
      donePoints: person.done_points,
      totalPoints: person.total_points,
    })),
    usesPoints: report.committed_points + report.added_points > 0,
  };
}

/** Share of the committed work delivered, as a whole percent. */
export function getDeliveredPercent(numbers: SprintSummaryNumbers) {
  const done = numbers.usesPoints ? numbers.donePoints : numbers.doneTasks;
  const committed = numbers.usesPoints
    ? numbers.committedPoints
    : numbers.committedTasks;
  return committed > 0 ? Math.round((done / committed) * 100) : 0;
}

/** Open tasks of a sprint, the ones that need a carry-or-backlog decision. */
export function getUnfinishedSprintTasks(
  sprint: Pick<BoardSprint, 'tasks'>,
  tasksById: ReadonlyMap<string, Task>
) {
  return sprint.tasks.flatMap((entry) => {
    const task = tasksById.get(entry.task_id);
    return task && !task.deleted_at && !isTaskFinished(task)
      ? [{ entry, task }]
      : [];
  });
}

export function setAllDecisions(
  taskIds: readonly string[],
  decision: BoardSprintEndDecision
): SprintEndDecisions {
  return Object.fromEntries(taskIds.map((id) => [id, decision]));
}

export function countMissingDecisions(
  taskIds: readonly string[],
  decisions: SprintEndDecisions
) {
  return taskIds.filter((id) => !decisions[id]).length;
}
