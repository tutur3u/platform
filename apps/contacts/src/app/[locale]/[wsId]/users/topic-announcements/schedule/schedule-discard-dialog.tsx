'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { useTranslations } from 'next-intl';

/** Confirms leaving the month (or discarding) with unsaved edits. */
export function ScheduleDiscardDialog({
  onCancel,
  onConfirm,
  open,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
}) {
  const t = useTranslations('ws-topic-announcements');
  return (
    <AlertDialog
      onOpenChange={(next) => (next ? null : onCancel())}
      open={open}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('schedule_discard_title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('schedule_discard_description')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('schedule_keep_editing')}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {t('schedule_discard_confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
