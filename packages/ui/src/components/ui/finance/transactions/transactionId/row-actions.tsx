'use client';

import { useQueryClient } from '@tanstack/react-query';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { joinPath } from '@tuturuuu/utils/path-helper';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { FormEvent } from 'react';
import { useId, useState } from 'react';
import { invalidateTransactionAttachmentQueries } from '../query-invalidation';

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
  const queryClient = useQueryClient();
  const fileNameInputId = useId();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  const deleteStorageObject = async () => {
    if (!storageObj.name) return;

    setIsDeleting(true);
    try {
      await deleteWorkspaceStorageObject(
        wsId,
        joinPath('finance', 'transactions', transactionId, storageObj.name)
      );
      await invalidateTransactionAttachmentQueries(
        queryClient,
        wsId,
        transactionId
      );
      toast.success(t('ws-transactions.file_deleted'));
      router.refresh();
    } catch {
      toast.error(t('ws-transactions.failed_to_delete_file'));
    } finally {
      setIsDeleting(false);
    }
  };

  const openRenameDialog = () => {
    if (!storageObj.name) return;

    setRenameValue(storageObj.name.split(`${wsId}/`).pop() || storageObj.name);
    setShowRenameDialog(true);
  };

  const renameStorageObject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!storageObj.name) return;

    const newName = renameValue.trim();
    if (!newName) return;

    // re-add extension if it was removed
    const safeNewName = storageObj.name.includes('.')
      ? newName.includes('.')
        ? newName
        : `${newName}.${storageObj.name.split('.').pop()}`
      : newName;

    setIsRenaming(true);
    try {
      await renameWorkspaceStorageObject(wsId, {
        path: joinPath('finance', 'transactions', transactionId),
        currentName: storageObj.name,
        newName: safeNewName,
      });
      await invalidateTransactionAttachmentQueries(
        queryClient,
        wsId,
        transactionId
      );
      toast.success(t('ws-transactions.file_renamed'));
      setShowRenameDialog(false);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('ws-transactions.failed_to_rename_file')
      );
    } finally {
      setIsRenaming(false);
    }
  };

  const downloadStorageObject = async () => {
    if (!storageObj.name) return;

    try {
      const signedUrl = await createWorkspaceStorageSignedUrl(
        wsId,
        joinPath('finance', 'transactions', transactionId, storageObj.name)
      );
      const response = await fetch(signedUrl, { cache: 'no-store' });
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
            <span className="sr-only">{t('common.open_menu')}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={openRenameDialog}>
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

      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('ws-transactions.rename_file')}</DialogTitle>
            <DialogDescription>
              {t('ws-transactions.rename_file_description')}
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={renameStorageObject}>
            <div className="space-y-2">
              <label className="font-medium text-sm" htmlFor={fileNameInputId}>
                {t('ws-transactions.file_name')}
              </label>
              <Input
                id={fileNameInputId}
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                placeholder={t('ws-transactions.file_name_placeholder')}
                disabled={isRenaming}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowRenameDialog(false)}
                disabled={isRenaming}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={isRenaming || !renameValue.trim()}
              >
                {isRenaming ? t('common.saving') : t('common.rename')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
