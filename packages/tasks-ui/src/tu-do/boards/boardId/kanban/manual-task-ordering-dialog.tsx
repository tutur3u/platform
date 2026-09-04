'use client';

import { AlertTriangle } from '@tuturuuu/icons';
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

interface ManualTaskOrderingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEnableManualOrdering: () => void;
}

export function ManualTaskOrderingDialog({
  open,
  onOpenChange,
  onEnableManualOrdering,
}: ManualTaskOrderingDialogProps) {
  const t = useTranslations('ws-task-boards.manual_ordering_disabled');

  const handleEnableManualOrdering = () => {
    onEnableManualOrdering();
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-dynamic-yellow/10">
              <AlertTriangle className="size-5 text-dynamic-yellow" />
            </div>
            <div className="min-w-0 flex-1">
              <AlertDialogTitle>{t('title')}</AlertDialogTitle>
              <AlertDialogDescription className="mt-1.5">
                {t('description')}
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('keep_sorting')}</AlertDialogCancel>
          <AlertDialogAction onClick={handleEnableManualOrdering}>
            {t('use_manual')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
