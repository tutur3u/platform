import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import type { DragPreviewPosition, TaskDropPosition } from './task-drag-types';
import { compareTasksByEffectiveSortKey } from './task-sort-key';

export function getNeighborTaskIds(tasks: Task[], taskId: string) {
  const taskIndex = tasks.findIndex((task) => task.id === taskId);

  if (taskIndex === -1) {
    return {
      previousTaskId: null,
      nextTaskId: null,
    };
  }

  return {
    previousTaskId: tasks[taskIndex - 1]?.id ?? null,
    nextTaskId: tasks[taskIndex + 1]?.id ?? null,
  };
}

export function getTaskInsertionIndex({
  overTaskId,
  position,
  tasks,
}: {
  overTaskId: string;
  position: TaskDropPosition;
  tasks: Pick<Task, 'id'>[];
}) {
  const overIndex = tasks.findIndex((task) => task.id === overTaskId);
  if (overIndex === -1) return tasks.length;

  return overIndex + (position === 'after' ? 1 : 0);
}

export function insertTaskAtDropPosition({
  activeTask,
  overTaskId,
  position,
  targetListTasks,
}: {
  activeTask: Task;
  overTaskId: string;
  position: TaskDropPosition;
  targetListTasks: Task[];
}) {
  const tasksWithoutActive = targetListTasks.filter(
    (task) => task.id !== activeTask.id
  );
  const insertionIndex = getTaskInsertionIndex({
    overTaskId,
    position,
    tasks: tasksWithoutActive,
  });

  return [
    ...tasksWithoutActive.slice(0, insertionIndex),
    activeTask,
    ...tasksWithoutActive.slice(insertionIndex),
  ];
}

export function insertTaskAtInsertionIndex({
  activeTask,
  insertionIndex,
  targetListTasks,
}: {
  activeTask: Task;
  insertionIndex: number;
  targetListTasks: Task[];
}) {
  const tasksWithoutActive = targetListTasks.filter(
    (task) => task.id !== activeTask.id
  );
  const safeInsertionIndex = Math.max(
    0,
    Math.min(insertionIndex, tasksWithoutActive.length)
  );

  return [
    ...tasksWithoutActive.slice(0, safeInsertionIndex),
    activeTask,
    ...tasksWithoutActive.slice(safeInsertionIndex),
  ];
}

export function getProjectedTaskDropOrderFromPreview({
  activeTask,
  isCompletionList,
  preview,
  targetListTasks,
}: {
  activeTask: Task;
  isCompletionList: boolean;
  preview: DragPreviewPosition | null;
  targetListTasks: Task[];
}) {
  const targetListTasksWithoutActive = targetListTasks.filter(
    (task) => task.id !== activeTask.id
  );

  if (isCompletionList) {
    return [activeTask, ...targetListTasksWithoutActive];
  }

  if (!preview) {
    return [...targetListTasksWithoutActive, activeTask];
  }

  return insertTaskAtInsertionIndex({
    activeTask,
    insertionIndex: preview.insertionIndex,
    targetListTasks,
  });
}

export function sortTasksForList({
  disableSort,
  targetList,
  tasks,
}: {
  disableSort: boolean;
  targetList: TaskList | undefined;
  tasks: Task[];
}) {
  return [...tasks].sort((a, b) => {
    if (targetList?.status === 'done') {
      const completionA = a.completed_at
        ? new Date(a.completed_at).getTime()
        : 0;
      const completionB = b.completed_at
        ? new Date(b.completed_at).getTime()
        : 0;
      return completionB - completionA;
    }

    if (targetList?.status === 'closed') {
      const closedA = a.closed_at ? new Date(a.closed_at).getTime() : 0;
      const closedB = b.closed_at ? new Date(b.closed_at).getTime() : 0;
      return closedB - closedA;
    }

    if (!disableSort) {
      return compareTasksByEffectiveSortKey(a, b);
    }

    return 0;
  });
}
