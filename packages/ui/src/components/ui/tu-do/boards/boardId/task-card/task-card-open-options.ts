import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';

interface TaskCardOpenOptionsInput {
  task: Task;
  boardId: string;
  availableLists?: TaskList[];
  effectiveWorkspaceId?: string;
  isPersonalWorkspace: boolean;
}

export function getTaskCardHydratingOpenOptions({
  task,
  boardId,
  availableLists,
  effectiveWorkspaceId,
  isPersonalWorkspace,
}: TaskCardOpenOptionsInput) {
  const sourceWorkspaceId = task.source_workspace_id;
  const sourceBoardId = task.source_board_id;

  return {
    initialTask: task,
    boardId: sourceBoardId ?? boardId,
    availableLists: sourceBoardId ? undefined : availableLists,
    taskWsId: sourceWorkspaceId ?? effectiveWorkspaceId,
    taskWorkspacePersonal: sourceWorkspaceId ? false : isPersonalWorkspace,
  };
}
