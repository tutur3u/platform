'use client';

import { useMutation } from '@tanstack/react-query';
import {
  deleteWorkspaceStorageFolder,
  deleteWorkspaceStorageObjects,
} from '@tuturuuu/internal-api';
import type { StorageObject } from '@tuturuuu/types/primitives/StorageObject';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';

interface DriveDeleteMutationOptions {
  currentPath: string;
  onSettled: () => void;
  onSuccess: () => Promise<void> | void;
  wsId: string;
}

export function useDriveDeleteMutation({
  currentPath,
  onSettled,
  onSuccess,
  wsId,
}: DriveDeleteMutationOptions) {
  const t = useTranslations('ws-storage-objects');

  return useMutation({
    mutationFn: async (targets: StorageObject[]) => {
      const files = targets.filter(
        (target): target is StorageObject & { name: string; id: string } =>
          Boolean(target.id && target.name)
      );
      const folders = targets.filter(
        (target): target is StorageObject & { name: string } =>
          Boolean(!target.id && target.name)
      );

      if (files.length > 0) {
        await deleteWorkspaceStorageObjects(
          wsId,
          files.map((target) =>
            currentPath ? `${currentPath}/${target.name}` : target.name
          ),
          { fetch }
        );
      }

      if (folders.length > 0) {
        await Promise.all(
          folders.map((target) =>
            deleteWorkspaceStorageFolder(
              wsId,
              { path: currentPath || undefined, name: target.name },
              { fetch }
            )
          )
        );
      }

      return {
        count: targets.length,
        hasFiles: files.length > 0,
        hasFolders: folders.length > 0,
      };
    },
    onSuccess: async (result) => {
      await onSuccess();

      if (result.count === 1 && result.hasFolders && !result.hasFiles) {
        toast.success(t('folder_deleted'));
        return;
      }

      if (result.count === 1 && result.hasFiles && !result.hasFolders) {
        toast.success(t('file_deleted'));
        return;
      }

      toast.success(t('bulk_delete_success', { count: result.count }));
    },
    onError: () => {
      toast.error(t('delete_failed'));
    },
    onSettled,
  });
}
