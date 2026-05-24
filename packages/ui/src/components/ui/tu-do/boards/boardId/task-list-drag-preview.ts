import type { Task } from '@tuturuuu/types/primitives/Task';

export type TaskListDragPreviewPosition = {
  listId: string;
  overTaskId: string | null;
  position: 'before' | 'after' | 'empty';
  task: Task;
  height: number;
};

export type TaskListDragPreviewSlot =
  | { kind: 'card-placeholder'; height: number; taskName: string }
  | { kind: 'insertion-line'; taskName: string };

export type TaskListDragPreviewSlotTarget =
  | { kind: 'start' }
  | { kind: 'before-task'; taskId: string }
  | { kind: 'end' }
  | { kind: 'empty-list' };

export function getTaskListDragPreviewSlot({
  columnId,
  preview,
  target,
}: {
  columnId: string;
  preview: TaskListDragPreviewPosition | null | undefined;
  target: TaskListDragPreviewSlotTarget;
}): TaskListDragPreviewSlot | null {
  if (!preview || String(preview.listId) !== String(columnId)) return null;

  const matchesTarget =
    (target.kind === 'start' &&
      preview.position === 'before' &&
      preview.overTaskId === null) ||
    (target.kind === 'before-task' &&
      preview.position === 'before' &&
      preview.overTaskId === target.taskId &&
      preview.task.id !== target.taskId) ||
    (target.kind === 'end' && preview.position === 'empty') ||
    (target.kind === 'empty-list' && preview.position === 'empty');

  if (!matchesTarget) return null;

  const sameListDrag = String(preview.task.list_id) === String(columnId);
  const taskName = preview.task.name;

  if (sameListDrag && target.kind !== 'empty-list') {
    return { kind: 'insertion-line', taskName };
  }

  return {
    kind: 'card-placeholder',
    height: preview.height,
    taskName,
  };
}
