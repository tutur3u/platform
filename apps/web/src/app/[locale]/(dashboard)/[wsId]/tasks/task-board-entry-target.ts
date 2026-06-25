import type { WorkspaceTaskBoardListItem } from '@tuturuuu/internal-api/tasks';

export type TaskBoardEntryTarget =
  | { boardId: string; type: 'redirect' }
  | { type: 'create' }
  | { type: 'not-found' };

export function resolveTaskBoardEntryTarget({
  accessType,
  boards,
  defaultBoardId,
}: {
  accessType?: 'guest' | 'member';
  boards: Pick<WorkspaceTaskBoardListItem, 'id'>[];
  defaultBoardId: string | null | undefined;
}): TaskBoardEntryTarget {
  const firstBoard = boards[0];
  const defaultBoard = defaultBoardId
    ? boards.find((board) => board.id === defaultBoardId)
    : undefined;
  const targetBoard = defaultBoard ?? firstBoard;

  if (targetBoard) return { boardId: targetBoard.id, type: 'redirect' };

  return accessType === 'member' ? { type: 'create' } : { type: 'not-found' };
}
