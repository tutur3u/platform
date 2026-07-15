'use client';

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

// Default translations for when component is rendered outside NextIntlClientProvider
// (e.g., in isolated React roots like TipTap mention extensions)
const defaultTranslations = {
  delete_task: 'Delete Task',
  delete_task_confirmation: (name: string) =>
    `Are you sure you want to delete "${name}"? This action cannot be undone.`,
  cancel: 'Cancel',
  deleting: 'Deleting...',
};

interface TaskDeleteDialogProps {
  task: Task;
  open: boolean;
  isLoading: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  /** Optional translations override for use in isolated React roots */
  translations?: {
    delete_task?: string;
    delete_task_confirmation?: string | ((name: string) => string);
    cancel?: string;
    deleting?: string;
  };
}

export function TaskDeleteDialog({
  task,
  open,
  isLoading,
  onOpenChange,
  onConfirm,
  translations,
}: TaskDeleteDialogProps) {
  // Use provided translations or defaults
  const t = {
    delete_task: translations?.delete_task ?? defaultTranslations.delete_task,
    delete_task_confirmation:
      typeof translations?.delete_task_confirmation === 'function'
        ? translations.delete_task_confirmation(task.name ?? '')
        : typeof translations?.delete_task_confirmation === 'string'
          ? translations.delete_task_confirmation
          : defaultTranslations.delete_task_confirmation(task.name ?? ''),
    cancel: translations?.cancel ?? defaultTranslations.cancel,
    deleting: translations?.deleting ?? defaultTranslations.deleting,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t.delete_task}</DialogTitle>
          <DialogDescription>{t.delete_task_confirmation}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            {t.cancel}
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
                {t.deleting}
              </>
            ) : (
              t.delete_task
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
