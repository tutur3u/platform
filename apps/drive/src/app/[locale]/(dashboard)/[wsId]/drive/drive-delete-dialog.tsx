'use client';

import type { StorageObject } from '@tuturuuu/types/primitives/StorageObject';
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
import { getStorageObjectDisplayName } from './storage-display-name';

/** Deletion is permanent in Drive; the dialog says so in its action. */
export function DriveDeleteDialog({
  isPending,
  items,
  onConfirm,
  onOpenChange,
}: {
  isPending: boolean;
  items: StorageObject[] | null;
  onConfirm: (items: StorageObject[]) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('drive');
  const only = items?.length === 1 ? items[0] : undefined;
  const hasFolders = items?.some((item) => !item.id) ?? false;

  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (!isPending) onOpenChange(open);
      }}
      open={items !== null}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {only
              ? t('delete.title_one', {
                  name: getStorageObjectDisplayName(only),
                })
              : t('delete.title_many', { count: items?.length ?? 0 })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {hasFolders
              ? t('delete.description_folders')
              : t('delete.description')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>
            {t('common.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={isPending || !items?.length}
            onClick={(event) => {
              event.preventDefault();
              if (items?.length) onConfirm(items);
            }}
          >
            {isPending ? t('delete.deleting') : t('actions.delete_forever')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
