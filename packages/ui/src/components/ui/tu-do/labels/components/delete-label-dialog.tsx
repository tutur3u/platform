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
import type { TaskLabel } from '../types';

interface DeleteLabelDialogProps {
  label: TaskLabel | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function DeleteLabelDialog({
  label,
  open,
  onOpenChange,
  onConfirm,
}: DeleteLabelDialogProps) {
  const t = useTranslations('ws-tasks-labels');

  if (!label) return null;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('delete_label')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t.rich('delete_confirmation', {
              name: label.name,
              nameTag: (chunks) => (
                <span className="font-semibold">{chunks}</span>
              ),
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {t('delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
