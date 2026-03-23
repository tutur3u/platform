'use client';

import { Ellipsis } from '@tuturuuu/icons';
import {
  createWorkspaceStorageSignedUrl,
  deleteWorkspaceStorageObject,
  renameWorkspaceStorageObject,
} from '@tuturuuu/internal-api';
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
  AlertDialogTrigger,
} from '@tuturuuu/ui/alert-dialog';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { toast } from '@tuturuuu/ui/sonner';
import { joinPath } from '@tuturuuu/utils/path-helper';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface Props {
  wsId: string;
  transactionId: string;
  storageObj: StorageObject;
}

export function TransactionObjectRowActions({
  wsId,
  transactionId,
  storageObj,
}: Props) {
  const t = useTranslations();

  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteStorageObject = async () => {
    if (!storageObj.name) return;

    setIsDeleting(true);
    try {
      await deleteWorkspaceStorageObject(
        wsId,
        joinPath('finance', 'transactions', transactionId, storageObj.name)
      );
      toast.success(t('ws-transactions.file_deleted'));
      router.refresh();
    } catch {
      toast.error(t('ws-transactions.failed_to_delete_file'));
    } finally {
      setIsDeleting(false);
    }
  };

  const renameStorageObject = async () => {
    if (!storageObj.name) return;

    const newName = prompt(
      'Enter new name',
      storageObj.name.split(`${wsId}/`)[1]
    );

    if (!newName) return;

    // re-add extension if it was removed
    const safeNewName = storageObj.name.includes('.')
      ? newName.includes('.')
        ? newName
        : `${newName}.${storageObj.name.split('.').pop()}`
      : newName;

    try {
      await renameWorkspaceStorageObject(wsId, {
        path: joinPath('finance', 'transactions', transactionId),
        currentName: storageObj.name,
        newName: safeNewName,
      });
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('ws-transactions.failed_to_rename_file')
      );
    }
  };

  const downloadStorageObject = async () => {
    if (!storageObj.name) return;

    try {
      const signedUrl = await createWorkspaceStorageSignedUrl(
        wsId,
        joinPath('finance', 'transactions', transactionId, storageObj.name)
      );
      const response = await fetch(signedUrl);
      if (!response.ok) {
        throw new Error('Failed to download file');
      }
      const data = await response.blob();
      const url = URL.createObjectURL(data);

      const a = document.createElement('a');
      a.href = url;
      a.download = storageObj.name.split(`${wsId}/`).pop() || '';
      a.click();

      URL.revokeObjectURL(url);
    } catch {
      toast.error(t('ws-transactions.failed_to_download_file'));
    }
  };

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="flex h-6 w-6 p-0 data-[state=open]:bg-muted"
            size="xs"
          >
            <Ellipsis className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={renameStorageObject}>
            {t('common.rename')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={downloadStorageObject}>
            {t('common.download')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <DropdownMenuItem
                onSelect={(e) => e.preventDefault()}
                disabled={isDeleting}
              >
                {t('common.delete')}
              </DropdownMenuItem>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t('common.confirm_delete_title')}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t('ws-transactions.confirm_delete_file')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={deleteStorageObject}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={isDeleting}
                >
                  {isDeleting ? t('common.deleting') : t('common.delete')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
