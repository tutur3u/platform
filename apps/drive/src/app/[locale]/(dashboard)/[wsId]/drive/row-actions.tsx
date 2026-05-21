'use client';

import type { Row } from '@tanstack/react-table';
import { Ellipsis } from '@tuturuuu/icons';
import { createWorkspaceStorageSignedUrl } from '@tuturuuu/internal-api';
import type { StorageObject } from '@tuturuuu/types/primitives/StorageObject';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { joinPath } from '@tuturuuu/utils/path-helper';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { WorkspaceStorageExportLinksDialog } from './export-links-dialog';
import { RenameStorageObjectDialog } from './rename-storage-object-dialog';
import { RowActionsMenuContent } from './row-actions-menu-content';

interface Props {
  wsId: string;
  row: Row<StorageObject>;
  path?: string;
  setStorageObject: (value: StorageObject | undefined) => void;
  menuOnly?: boolean;
  contextMenu?: boolean;
  onRequestRename?: (obj: StorageObject) => void;
  onRequestDelete?: (obj: StorageObject) => void;
  onMutationSuccess?: () => void | Promise<void>;
}

export function StorageObjectRowActions({
  wsId,
  row,
  path = '',
  setStorageObject,
  menuOnly = false,
  contextMenu = false,
  onRequestRename,
  onRequestDelete,
  onMutationSuccess,
}: Props) {
  const t = useTranslations();
  const storageObj = row.original;
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const exportFolderPath = storageObj.id
    ? null
    : joinPath(path, storageObj.name || '');

  const createSignedUrl = () => {
    if (!storageObj.name) {
      throw new Error('Missing storage object name');
    }

    return createWorkspaceStorageSignedUrl(
      wsId,
      joinPath(path, storageObj.name),
      3600
    );
  };
  const requestRename = () =>
    onRequestRename ? onRequestRename(storageObj) : setShowRenameDialog(true);
  const previewFile = () => setStorageObject(storageObj);
  const copyPath = async () => {
    if (!storageObj.name) return;

    try {
      await navigator.clipboard.writeText(
        joinPath(wsId, path, storageObj.name)
      );
      toast({
        title: t('common.success'),
        description: t('ws-storage-objects.path_copied'),
      });
    } catch {
      toast({
        title: t('common.error'),
        description: 'Failed to copy',
        variant: 'destructive',
      });
    }
  };
  const shareFile = async () => {
    try {
      await navigator.clipboard.writeText(await createSignedUrl());
      toast({
        title: t('common.success'),
        description: t('ws-storage-objects.share_link_copied'),
      });
    } catch {
      toast({
        title: t('common.error'),
        description: t('ws-storage-objects.share_failed'),
        variant: 'destructive',
      });
    }
  };
  const openExternal = async () => {
    try {
      window.open(await createSignedUrl(), '_blank');
    } catch {
      toast({
        title: t('common.error'),
        description: t('ws-storage-objects.open_failed'),
        variant: 'destructive',
      });
    }
  };
  const downloadStorageObject = async () => {
    if (!storageObj.name) return;

    try {
      const response = await fetch(await createSignedUrl(), {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Download failed');

      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = storageObj.name.split(`${wsId}/`).pop() || '';
      a.click();
      URL.revokeObjectURL(url);
      toast({
        title: t('common.success'),
        description: t('ws-storage-objects.download_started'),
      });
    } catch {
      toast({
        title: t('common.error'),
        description: t('ws-storage-objects.download_failed'),
        variant: 'destructive',
      });
    }
  };

  const menuContent = (
    <RowActionsMenuContent
      contextMenu={contextMenu}
      exportFolderPath={exportFolderPath}
      isFile={Boolean(storageObj.id)}
      onCopyPath={copyPath}
      onDelete={() => onRequestDelete?.(storageObj)}
      onDownload={downloadStorageObject}
      onExportFolder={() => setShowExportDialog(true)}
      onOpenExternal={openExternal}
      onPreview={previewFile}
      onRename={requestRename}
      onShare={shareFile}
    />
  );

  return (
    <>
      {menuOnly ? (
        menuContent
      ) : (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <Ellipsis className="h-4 w-4" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-45">
            {menuContent}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <RenameStorageObjectDialog
        wsId={wsId}
        path={path}
        storageObject={showRenameDialog ? storageObj : null}
        open={showRenameDialog}
        onOpenChange={setShowRenameDialog}
        onSuccess={onMutationSuccess}
      />
      {exportFolderPath ? (
        <WorkspaceStorageExportLinksDialog
          wsId={wsId}
          folderPath={exportFolderPath}
          folderName={storageObj.name || ''}
          open={showExportDialog}
          onOpenChange={setShowExportDialog}
        />
      ) : null}
    </>
  );
}
