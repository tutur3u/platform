'use client';

import { useMutation } from '@tanstack/react-query';
import { renameWorkspaceStorageObject } from '@tuturuuu/internal-api';
import type { StorageObject } from '@tuturuuu/types/primitives/StorageObject';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface RenameStorageObjectDialogProps {
  wsId: string;
  path?: string;
  storageObject: StorageObject | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

function stripUploadedFilePrefix(name: string) {
  return name.replace(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i,
    ''
  );
}

function getDefaultRenameValue(storageObject: StorageObject | null) {
  if (!storageObject?.name) return '';
  return storageObject.id
    ? stripUploadedFilePrefix(storageObject.name)
    : storageObject.name;
}

function getFinalRenameValue(
  storageObject: StorageObject | null,
  nextName: string
) {
  const currentName = storageObject?.name;

  if (!storageObject?.id || !currentName?.includes('.')) {
    return nextName;
  }

  return nextName.includes('.')
    ? nextName
    : `${nextName}.${currentName.split('.').pop()}`;
}

export function RenameStorageObjectDialog({
  wsId,
  path = '',
  storageObject,
  open,
  onOpenChange,
  onSuccess,
}: RenameStorageObjectDialogProps) {
  const t = useTranslations();
  const [name, setName] = useState('');
  const isFolder = !storageObject?.id;
  const renameMutation = useMutation({
    mutationFn: async (nextName: string) => {
      if (!storageObject?.name) {
        throw new Error('Missing storage object name');
      }

      return renameWorkspaceStorageObject(
        wsId,
        {
          path,
          currentName: storageObject.name,
          newName: getFinalRenameValue(storageObject, nextName),
          isFolder,
        },
        { fetch }
      );
    },
  });

  useEffect(() => {
    if (!open) {
      renameMutation.reset();
      return;
    }

    setName(getDefaultRenameValue(storageObject));
  }, [open, renameMutation, storageObject]);

  const submitting = renameMutation.isPending;

  const handleSubmit = async () => {
    if (!storageObject?.name) return;

    const trimmedName = name.trim();
    if (!trimmedName) return;

    try {
      await renameMutation.mutateAsync(trimmedName);
      toast({
        title: t('common.success'),
        description: isFolder
          ? t('ws-storage-objects.folder_renamed')
          : t('ws-storage-objects.file_renamed'),
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('common.error'),
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('common.rename')}</DialogTitle>
          <DialogDescription>
            {isFolder
              ? t('ws-storage-objects.enter_new_folder_name')
              : t('ws-storage-objects.enter_new_name')}
          </DialogDescription>
        </DialogHeader>

        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={
            isFolder
              ? t('ws-storage-objects.enter_new_folder_name')
              : t('ws-storage-objects.enter_new_name')
          }
          disabled={submitting}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void handleSubmit();
            }
          }}
        />

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || !name.trim()}
          >
            {submitting ? t('common.processing') : t('common.rename')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
