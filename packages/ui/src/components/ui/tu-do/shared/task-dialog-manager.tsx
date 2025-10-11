'use client';

import { lazy, Suspense } from 'react';
import { useTaskDialogContext } from '../providers/task-dialog-provider';

// Lazy load the heavy TaskEditDialog component
const TaskEditDialog = lazy(() =>
  import('./task-edit-dialog.js').then((mod) => ({
    default: mod.TaskEditDialog,
  }))
);

/**
 * Manager component that renders the centralized task dialog
 * This component should be placed once at the workspace layout level
 * It lazy-loads the actual dialog component only when first opened
 */
export function TaskDialogManager() {
  const { state, closeDialog, triggerUpdate } = useTaskDialogContext();

  // Don't render anything if dialog has never been opened
  if (!state.isOpen && !state.task) {
    return null;
  }

  return (
    <Suspense fallback={null}>
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
    </Suspense>
  );
}
