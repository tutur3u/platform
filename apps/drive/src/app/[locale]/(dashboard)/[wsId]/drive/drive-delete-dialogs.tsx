'use client';

import type { UseMutationResult } from '@tanstack/react-query';
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

interface DriveDeleteDialogsProps {
  bulkDeleteDialogOpen: boolean;
  deleteMutation: UseMutationResult<
    {
      count: number;
      hasFiles: boolean;
      hasFolders: boolean;
    },
    Error,
    StorageObject[]
  >;
  deleteTarget: StorageObject | null;
  selectedItems: StorageObject[];
  setBulkDeleteDialogOpen: (open: boolean) => void;
  setDeleteTarget: (target: StorageObject | null) => void;
}

export function DriveDeleteDialogs({
  bulkDeleteDialogOpen,
  deleteMutation,
  deleteTarget,
  selectedItems,
  setBulkDeleteDialogOpen,
  setDeleteTarget,
}: DriveDeleteDialogsProps) {
  const t = useTranslations('ws-storage-objects');
  const commonT = useTranslations('common');

  return (
    <>
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirm_delete_title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.id
                ? t('confirm_delete_file', {
                    name: getStorageObjectDisplayName(deleteTarget),
                  })
                : t('confirm_delete_folder', {
                    name: getStorageObjectDisplayName(deleteTarget),
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              {commonT('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending || !deleteTarget}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                if (deleteTarget) {
                  void deleteMutation.mutateAsync([deleteTarget]);
                }
              }}
            >
              {deleteMutation.isPending ? t('deleting') : commonT('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={bulkDeleteDialogOpen}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) {
            setBulkDeleteDialogOpen(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('bulk_delete_title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('bulk_delete_confirm_description', {
                count: selectedItems.length,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              {commonT('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending || selectedItems.length === 0}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                if (selectedItems.length > 0) {
                  void deleteMutation.mutateAsync(selectedItems);
                }
              }}
            >
              {deleteMutation.isPending ? t('deleting') : commonT('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
