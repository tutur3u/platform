import type { TaskCardProps } from './task-card';

function areSelectedTaskSetsEqual(
  previousSelectedTasks?: Set<string>,
  nextSelectedTasks?: Set<string>
) {
  if (previousSelectedTasks === nextSelectedTasks) return true;
  if (!previousSelectedTasks || !nextSelectedTasks) {
    return (
      (previousSelectedTasks?.size ?? 0) === (nextSelectedTasks?.size ?? 0)
    );
  }

  if (previousSelectedTasks.size !== nextSelectedTasks.size) return false;

  for (const taskId of previousSelectedTasks) {
    if (!nextSelectedTasks.has(taskId)) return false;
  }

  return true;
}

export function areTaskCardPropsEqual(
  prev: TaskCardProps,
  next: TaskCardProps
) {
  if (prev.isOverlay !== next.isOverlay) return false;
  if (prev.readOnly !== next.readOnly) return false;
  if (prev.isSelected !== next.isSelected) return false;
  if (prev.isMultiSelectMode !== next.isMultiSelectMode) return false;
  if (
    (prev.isSelected || next.isSelected) &&
    (prev.isMultiSelectMode || next.isMultiSelectMode) &&
    !areSelectedTaskSetsEqual(prev.selectedTasks, next.selectedTasks)
  ) {
    return false;
  }
  if (prev.boardId !== next.boardId) return false;
  if (prev.workspaceId !== next.workspaceId) return false;
  if (prev.deadlineContext !== next.deadlineContext) return false;
  if (prev.deadlineNow !== next.deadlineNow) return false;
  if (prev.dragDisabled !== next.dragDisabled) return false;
  if (prev.sortableId !== next.sortableId) return false;
  if (prev.suppressSortableTransform !== next.suppressSortableTransform) {
    return false;
  }
  if (
    (prev.optimisticUpdateInProgress?.has(prev.task.id) ?? false) !==
    (next.optimisticUpdateInProgress?.has(next.task.id) ?? false)
  ) {
    return false;
  }

  if (
    prev.taskList?.color !== next.taskList?.color ||
    prev.taskList?.status !== next.taskList?.status
  ) {
    return false;
  }

  const previousTask = prev.task;
  const nextTask = next.task;
  if (previousTask === nextTask) return true;

  const keys: (keyof typeof previousTask)[] = [
    'id',
    'name',
    'description',
    'priority',
    'closed_at',
    'end_date',
    'start_date',
    'completed_at',
    'estimation_points',
    'total_duration',
    'is_splittable',
    'min_split_duration_minutes',
    'max_split_duration_minutes',
    'calendar_hours',
    'auto_schedule',
    'relationship_summary',
    'list_id',
  ];

  for (const key of keys) {
    if (previousTask[key] !== nextTask[key]) return false;
  }

  const previousLabels = (previousTask.labels || [])
    .map((label) => label.name)
    .sort()
    .join('|');
  const nextLabels = (nextTask.labels || [])
    .map((label) => label.name)
    .sort()
    .join('|');
  if (previousLabels !== nextLabels) return false;

  const previousAssignees = (previousTask.assignees || [])
    .map((assignee) => assignee.id)
    .filter(Boolean)
    .sort()
    .join('|');
  const nextAssignees = (nextTask.assignees || [])
    .map((assignee) => assignee.id)
    .filter(Boolean)
    .sort()
    .join('|');
  if (previousAssignees !== nextAssignees) return false;

  const previousProjects = (previousTask.projects || [])
    .map((project) => project.id)
    .filter(Boolean)
    .sort()
    .join('|');
  const nextProjects = (nextTask.projects || [])
    .map((project) => project.id)
    .filter(Boolean)
    .sort()
    .join('|');

  return previousProjects === nextProjects;
}
