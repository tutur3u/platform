'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash } from '@tuturuuu/icons';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';

interface TaskDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId?: string;
  boardId: string;
  wsId: string;
  isLoading: boolean;
  onSuccess: () => void;
  onClose: () => void;
}

export function TaskDeleteDialog({
  open,
  onOpenChange,
  taskId,
  boardId,
  wsId,
  isLoading,
  onSuccess,
  onClose,
}: TaskDeleteDialogProps) {
  const queryClient = useQueryClient();

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/tasks/${taskId}/trash`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete task');
      }

      return response.json();
    },
    onMutate: async (deletingTaskId: string) => {
      // Cancel any outgoing refetches to prevent overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ['tasks', boardId] });

      // Snapshot current tasks for rollback
      const previousTasks = queryClient.getQueryData<Task[]>([
        'tasks',
        boardId,
      ]);

      // Optimistically remove the task from cache immediately
      queryClient.setQueryData(
        ['tasks', boardId],
        (oldTasks: Task[] | undefined) => {
          if (!oldTasks) return oldTasks;
          return oldTasks.filter((task) => task.id !== deletingTaskId);
        }
      );

      return { previousTasks };
    },
    onSuccess: async () => {
      // Don't invalidate - optimistic update already removed the task
      // Realtime will handle sync if needed
      toast.success('Task moved to trash');
      onOpenChange(false);
      onSuccess();
      onClose();
    },
    onError: (error: Error, _, context) => {
      // Rollback optimistic update on error
      if (context?.previousTasks) {
        queryClient.setQueryData(['tasks', boardId], context.previousTasks);
      }
      toast.error(error.message || 'Failed to delete task. Please try again.');
    },
  });

  const handleDelete = async () => {
    if (!taskId) return;
    deleteTaskMutation.mutate(taskId);
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
