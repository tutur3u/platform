import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { isPersonalExternalOverlayTask } from '@tuturuuu/ui/lib/task-personal-external';

export interface TaskCardResourceContextInput {
  boardId: string;
  pageWorkspaceId?: string;
  propAvailableLists?: TaskList[];
  task: Task;
}

export interface TaskCardResourceContext {
  boardViewableMembersBoardId: string;
  boardViewableMembersWorkspaceId?: string;
  effectiveWorkspaceId?: string;
  initialAvailableLists?: TaskList[];
  isSourceWorkspaceTask: boolean;
  relationshipWorkspaceId?: string;
  taskBoardId: string;
}

export function getTaskCardResourceContext({
  boardId,
  pageWorkspaceId,
  propAvailableLists,
  task,
}: TaskCardResourceContextInput): TaskCardResourceContext {
  const effectiveWorkspaceId = task.source_workspace_id ?? pageWorkspaceId;
  const taskBoardId = task.source_board_id ?? boardId;
  const isSourceWorkspaceTask = Boolean(
    task.source_workspace_id || task.source_board_id
  );
  const relationshipWorkspaceId = isPersonalExternalOverlayTask(task)
    ? pageWorkspaceId
    : effectiveWorkspaceId;
  const boardViewableMembersWorkspaceId =
    task.source_workspace_id ?? pageWorkspaceId;
  const boardViewableMembersBoardId =
    isSourceWorkspaceTask && task.source_board_id
      ? task.source_board_id
      : boardId;
  const initialAvailableLists =
    isSourceWorkspaceTask && task.source_board_id
      ? undefined
      : propAvailableLists;

  return {
    boardViewableMembersBoardId,
    boardViewableMembersWorkspaceId,
    effectiveWorkspaceId,
    initialAvailableLists,
    isSourceWorkspaceTask,
    relationshipWorkspaceId,
    taskBoardId,
  };
}
