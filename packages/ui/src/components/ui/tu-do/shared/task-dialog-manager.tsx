'use client';

import { useTaskDialogContext } from '../providers/task-dialog-provider';
import { TaskEditDialog } from './task-edit-dialog';

/**
 * Manager component that renders the centralized task dialog
 * This component should be placed once at the workspace layout level
 * It lazy-loads the actual dialog component only when first opened
 */
export function TaskDialogManager() {
  const { state, closeDialog, triggerUpdate } = useTaskDialogContext();

  return (
    <TaskEditDialog
      task={state.task}
      boardId={state.boardId || ''}
      isOpen={state.isOpen}
      onClose={closeDialog}
      onUpdate={triggerUpdate}
      availableLists={state.availableLists}
      mode={state.mode}
      showUserPresence={state.showUserPresence}
    />
  );
}
