'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Trash } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import { invalidateTaskCaches } from '@tuturuuu/utils/task-helper';

const supabase = createClient();

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
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleDelete = async () => {
    try {
      if (taskId) {
        const { error } = await supabase
          .from('tasks')
          .delete()
          .eq('id', taskId);
        if (error) throw error;
      }

      await invalidateTaskCaches(queryClient, boardId);
      toast({ title: 'Task deleted' });
      onOpenChange(false);
      onSuccess();
      onClose();
    } catch (e: any) {
      toast({
        title: 'Failed to delete task',
        description: e.message || 'Please try again',
        variant: 'destructive',
      });
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
              This action cannot be undone. The task will be permanently
              removed.
            </DialogDescription>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={isLoading}
            onClick={handleDelete}
          >
            Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
