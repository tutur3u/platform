'use client';

import { Trash } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { useDeleteTask } from '@tuturuuu/utils/task-helper';

interface TaskDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId?: string;
  boardId: string;
  isLoading: boolean;
  onSuccess: () => void;
  onClose: () => void;
}

export function TaskDeleteDialog({
  open,
  onOpenChange,
  taskId,
  boardId,
  isLoading,
  onSuccess,
  onClose,
}: TaskDeleteDialogProps) {
  const deleteTaskMutation = useDeleteTask(boardId);

  const handleDelete = async () => {
    if (!taskId) return;
    deleteTaskMutation.mutate(taskId);

    if (deleteTaskMutation.isSuccess) {
      toast.success('Task moved to trash');
      onOpenChange(false);
      onSuccess();
      onClose();
    }
  };

  return (
    <Dialog
      key="delete-dialog"
      open={open}
      onOpenChange={onOpenChange}
      modal={true}
    >
      <DialogContent showCloseButton={false} className="max-w-sm">
        <div className="flex items-start gap-3">
          <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-full bg-dynamic-red/10 ring-1 ring-dynamic-red/20">
            <Trash className="h-4 w-4 text-dynamic-red" />
          </div>
          <div className="flex-1">
            <DialogTitle className="text-base">Delete task?</DialogTitle>
            <DialogDescription className="mt-1 text-muted-foreground text-sm">
              Are you sure you want to move this task to the recycle bin?
            </DialogDescription>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={deleteTaskMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={isLoading || deleteTaskMutation.isPending}
            onClick={handleDelete}
          >
            {deleteTaskMutation.isPending ? 'Deleting...' : 'Move to Trash'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
