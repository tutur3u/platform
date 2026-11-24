import type { ReactNode } from 'react';
import { TaskCommentsSection } from './task-comments-section';
import { TaskLinksSection } from './task-links-section';

export { TaskDialogMetaRow } from './task-dialog-meta-row';

interface CollaborationPanelsInput {
  wsId: string;
  /** Undefined while creating a task: there is nothing to comment on yet. */
  taskId?: string;
  currentUserId?: string | null;
  disabled?: boolean;
}

/** The Comments and Linked resources panels for the details tabs. */
export function getCollaborationPanels({
  wsId,
  taskId,
  currentUserId,
  disabled,
}: CollaborationPanelsInput): { comments?: ReactNode; links?: ReactNode } {
  if (!taskId) return {};
  return {
    comments: (
      <TaskCommentsSection
        currentUserId={currentUserId}
        disabled={disabled}
        taskId={taskId}
        wsId={wsId}
      />
    ),
    links: <TaskLinksSection disabled={disabled} taskId={taskId} wsId={wsId} />,
  };
}
