'use client';

import { TaskShareDialog } from '../../../shared/task-share-dialog';
import { TaskActions } from '../task-actions';

interface Props {
  taskId: string;
  taskName: string;
  boardId: string;
  /** The task's resolved workspace, used for sharing and task actions. */
  workspaceId?: string | null;
  shareDialogOpen: boolean;
  onShareDialogOpenChange: (open: boolean) => void;
  showActions: boolean;
  onUpdate: () => void;
}

export function TaskCardFooterDialogs({
  taskId,
  taskName,
  boardId,
  workspaceId,
  shareDialogOpen,
  onShareDialogOpenChange,
  showActions,
  onUpdate,
}: Props) {
  return (
    <>
      {workspaceId && (
        <TaskShareDialog
          open={shareDialogOpen}
          onOpenChange={onShareDialogOpenChange}
          taskId={taskId}
          taskName={taskName}
          wsId={workspaceId}
        />
      )}
      {showActions && (
        <TaskActions
          taskId={taskId}
          boardId={boardId}
          workspaceId={workspaceId ?? undefined}
          onUpdate={onUpdate}
        />
      )}
    </>
  );
}
