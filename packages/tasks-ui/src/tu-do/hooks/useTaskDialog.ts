import { useTaskDialogContext } from '../providers/task-dialog-provider';

export function useTaskDialog() {
  const {
    openTask,
    openTaskById,
    createTask,
    createSubtask,
    createTaskWithRelationship,
    closeDialog,
    onUpdate,
    onClose,
  } = useTaskDialogContext();

  return {
    openTask,
    openTaskById,
    createTask,
    createSubtask,
    createTaskWithRelationship,
    closeDialog,
    onUpdate,
    onClose,
  };
}
