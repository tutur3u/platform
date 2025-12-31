import { Loader2 } from '@tuturuuu/icons';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';

interface TaskDeleteDialogProps {
  task: Task;
  open: boolean;
  isLoading: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function TaskDeleteDialog({
  task,
  open,
  isLoading,
  onOpenChange,
  onConfirm,
}: TaskDeleteDialogProps) {
  const t = useTranslations('common');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('delete_task')}</DialogTitle>
          <DialogDescription>
            {t('delete_task_confirmation', { name: task.name })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            {t('cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('deleting')}
              </>
            ) : (
              t('delete_task')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
