'use client';

import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { ExternalSourceBadge } from './external-source-badge';
import { TaskStatusControl } from './task-status-control';

interface TaskDialogMetaRowProps {
  wsId: string;
  /** Undefined while creating a task. */
  taskId?: string;
  lists?: TaskList[];
  currentListId?: string | null;
  disabled?: boolean;
  onSelectList: (listId: string) => void;
}

/** External source badge and status control shown under the task title. */
export function TaskDialogMetaRow({
  wsId,
  taskId,
  lists,
  currentListId,
  disabled,
  onSelectList,
}: TaskDialogMetaRowProps) {
  if (!taskId || !lists) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pb-2 md:px-8">
      <TaskStatusControl
        currentListId={currentListId}
        disabled={disabled}
        lists={lists}
        onSelectList={onSelectList}
      />
      <ExternalSourceBadge taskId={taskId} wsId={wsId} />
    </div>
  );
}
