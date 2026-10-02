import type { TaskFilters } from '../../shared/task-filter.types';

type WorkspaceChoice = { id: string };
type BoardChoice = { id: string; workspaceId: string };
function retainOmitted(saved: string[], choices: string[], next: string[]) {
  return [
    ...new Set([...saved.filter((id) => !choices.includes(id)), ...next]),
  ];
}

export function updateWorkspaceSourceFilter(
  filters: TaskFilters,
  workspaces: WorkspaceChoice[],
  boards: BoardChoice[],
  next: string[]
): TaskFilters {
  const selected = retainOmitted(
    filters.sourceWorkspaceIds ?? [],
    workspaces.map((ws) => ws.id),
    next
  );
  return {
    ...filters,
    sourceScope: 'external_specific',
    sourceWorkspaceIds: selected,
    sourceBoardIds: (filters.sourceBoardIds ?? []).filter((id) => {
      const board = boards.find((item) => item.id === id);
      return !board || selected.includes(board.workspaceId);
    }),
  };
}
export function updateBoardSourceFilter(
  filters: TaskFilters,
  boards: BoardChoice[],
  next: string[]
): TaskFilters {
  const selected = retainOmitted(
    filters.sourceBoardIds ?? [],
    boards.map((board) => board.id),
    next
  );
  return {
    ...filters,
    sourceScope: 'external_specific',
    sourceBoardIds: selected,
    sourceWorkspaceIds: [
      ...new Set([
        ...(filters.sourceWorkspaceIds ?? []),
        ...boards
          .filter((board) => selected.includes(board.id))
          .map((board) => board.workspaceId),
      ]),
    ],
  };
}
