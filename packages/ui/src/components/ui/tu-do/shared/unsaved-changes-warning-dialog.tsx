'use client';

import { AlertTriangle } from '@tuturuuu/icons';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';

interface UnsavedChangesWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
  onSaveAsDraft: () => void;
  onCreateTask: () => void;
  canSave: boolean;
}

export function UnsavedChangesWarningDialog({
  open,
  onOpenChange,
  onDiscard,
  onSaveAsDraft,
  onCreateTask,
  canSave,
}: UnsavedChangesWarningDialogProps) {
  const t = useTranslations('task-drafts');

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-dynamic-yellow/10">
              <AlertTriangle className="h-6 w-6 text-dynamic-yellow" />
            </div>
            <div className="flex-1">
              <AlertDialogTitle>{t('unsaved_changes')}</AlertDialogTitle>
              <AlertDialogDescription className="mt-1">
                {t('unsaved_changes_description')}
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
          <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
          <Button variant="outline" onClick={onDiscard}>
            {t('discard')}
          </Button>
          <Button
            variant="secondary"
            onClick={onSaveAsDraft}
            disabled={!canSave}
          >
            {t('save_as_draft')}
          </Button>
          <Button onClick={onCreateTask} disabled={!canSave}>
            {t('create_task')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
