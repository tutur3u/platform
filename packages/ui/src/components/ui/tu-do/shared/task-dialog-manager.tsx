'use client';

import dynamic from 'next/dynamic';
import { useTaskDialogContext } from '../providers/task-dialog-provider';

const TaskEditDialog = dynamic(
  () =>
    import('./task-edit-dialog').then((mod) => ({
      default: mod.TaskEditDialog,
    })),
  {
    ssr: false,
  }
);

/**
 * Manager component that renders the centralized task dialog
 * This component should be placed once at the workspace layout level
 * It lazy-loads the actual dialog component only when first opened
 */
export function TaskDialogManager() {
  const { state, closeDialog, triggerUpdate, openTaskById } = useTaskDialogContext();

  // Don't render anything if dialog has never been opened
  if (!state.isOpen && !state.task) {
    return null;
  }

  // No key prop to allow smooth transitions between tasks without remounting
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
      onOpenTask={openTaskById}
    />
  );
}
