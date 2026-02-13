import type {
  TaskUserOverride,
  TaskWithRelations,
  UserBoardListOverride,
} from '@tuturuuu/types';

/**
 * When self_managed is true, applies personal overrides to task fields.
 * Returns a new task object with effective values; never mutates the original.
 */
export function resolveEffectiveValues(
  task: TaskWithRelations,
  overrides: TaskUserOverride | null | undefined
): TaskWithRelations {
  if (!overrides || !overrides.self_managed) return task;

  return {
    ...task,
    priority:
      overrides.priority_override !== null
        ? overrides.priority_override
        : task.priority,
    end_date:
      overrides.due_date_override !== null
        ? overrides.due_date_override
        : task.end_date,
    estimation_points:
      overrides.estimation_override !== null
        ? overrides.estimation_override
        : task.estimation_points,
  };
}

/**
 * Checks whether a task should be hidden from My Tasks based on:
 * 1. Personal completion (completed_at is set)
 * 2. Personal unassignment (personally_unassigned is true)
 * 3. Board/list override status being 'done' or 'closed'
 */
export function isPersonallyHidden(
  task: TaskWithRelations,
  overrides: TaskUserOverride | null | undefined,
  boardListOverrides: UserBoardListOverride[]
): boolean {
  // Check personal completion
  if (overrides?.completed_at) return true;

  // Check personal unassignment
  if (overrides?.personally_unassigned) return true;

  // Check board-level override
  const boardId = task.list?.board?.id;
  if (boardId) {
    const boardOverride = boardListOverrides.find(
      (o) => o.scope_type === 'board' && o.board_id === boardId
    );
    if (
      boardOverride &&
      (boardOverride.personal_status === 'done' ||
        boardOverride.personal_status === 'closed')
    ) {
      return true;
    }
  }

  // Check list-level override
  const listId = task.list?.id;
  if (listId) {
    const listOverride = boardListOverrides.find(
      (o) => o.scope_type === 'list' && o.list_id === listId
    );
    if (
      listOverride &&
      (listOverride.personal_status === 'done' ||
        listOverride.personal_status === 'closed')
    ) {
      return true;
    }
  }

  return false;
}
