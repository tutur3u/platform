'use client';

import type { Row } from '@tanstack/react-table';
import {
  Copy,
  Download,
  Edit3,
  Ellipsis,
  ExternalLink,
  Eye,
  PackageOpen,
  Share,
  Trash,
} from '@tuturuuu/icons';
import { createWorkspaceStorageSignedUrl } from '@tuturuuu/internal-api';
import type { StorageObject } from '@tuturuuu/types/primitives/StorageObject';
import { Button } from '@tuturuuu/ui/button';
import {
  ContextMenuItem,
  ContextMenuSeparator,
} from '@tuturuuu/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { joinPath } from '@/utils/path-helper';
import { WorkspaceStorageExportLinksDialog } from './export-links-dialog';
import { RenameStorageObjectDialog } from './rename-storage-object-dialog';

interface Props {
  wsId: string;
  row: Row<StorageObject>;
  path?: string;
  setStorageObject: (value: StorageObject | undefined) => void;
  menuOnly?: boolean;
  contextMenu?: boolean;
  onRequestRename?: (obj: StorageObject) => void;
  onRequestDelete?: (obj: StorageObject) => void;
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
}: Props) {
  const t = useTranslations();
  const router = useRouter();
  const storageObj = row.original;
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const exportFolderPath = storageObj.id
    ? null
    : joinPath(path, storageObj.name || '');

  const requestRename = () => {
    if (onRequestRename) {
      onRequestRename(storageObj);
      return;
    }

    setShowRenameDialog(true);
  };

  const previewFile = () => {
    if (storageObj) {
      setStorageObject(storageObj);
    }
  };

  const copyPath = async () => {
    if (!storageObj.name) return;

    const fullPath = joinPath(wsId, path, storageObj.name);
    try {
      await navigator.clipboard.writeText(fullPath);
      toast({
        title: t('common.success'),
        description: t('ws-storage-objects.path_copied'),
      });
    } catch (_error) {
      toast({
        title: t('common.error'),
        description: 'Failed to copy',
        variant: 'destructive',
      });
    }
  };

  const shareFile = async () => {
    if (!storageObj.name) return;

    try {
      const signedUrl = await createWorkspaceStorageSignedUrl(
        wsId,
        joinPath(path, storageObj.name),
        3600
      );

      await navigator.clipboard.writeText(signedUrl);
      toast({
        title: t('common.success'),
        description: t('ws-storage-objects.share_link_copied'),
      });
    } catch (_error) {
      toast({
        title: t('common.error'),
        description: t('ws-storage-objects.share_failed'),
        variant: 'destructive',
      });
    }
  };

  const openExternal = async () => {
    if (!storageObj.name) return;

    try {
      const signedUrl = await createWorkspaceStorageSignedUrl(
        wsId,
        joinPath(path, storageObj.name),
        3600
      );

      window.open(signedUrl, '_blank');
    } catch (_error) {
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
      const signedUrl = await createWorkspaceStorageSignedUrl(
        wsId,
        joinPath(path, storageObj.name),
        3600
      );
      const response = await fetch(signedUrl);
      if (!response.ok) throw new Error('Download failed');
      const data = await response.blob();

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = storageObj.name.split(`${wsId}/`).pop() || '';
      a.click();
      URL.revokeObjectURL(url);

      toast({
        title: t('common.success'),
        description: t('ws-storage-objects.download_started'),
      });
    } catch (_error) {
      toast({
        title: t('common.error'),
        description: t('ws-storage-objects.download_failed'),
        variant: 'destructive',
      });
    }
  };

  const menuContent = contextMenu ? (
    <>
      {storageObj.id && (
        <>
          <ContextMenuItem onClick={previewFile}>
            <Eye className="mr-2 h-4 w-4" />
            {t('ws-storage-objects.preview')}
          </ContextMenuItem>
          <ContextMenuItem onClick={openExternal}>
            <ExternalLink className="mr-2 h-4 w-4" />
            {t('common.view')}
          </ContextMenuItem>
          <ContextMenuSeparator />
        </>
      )}
      <ContextMenuItem onClick={requestRename}>
        <Edit3 className="mr-2 h-4 w-4" />
        {t('common.rename')}
      </ContextMenuItem>
      {storageObj.id && (
        <>
          <ContextMenuItem
            onClick={(e) => {
              e.stopPropagation();
              copyPath();
            }}
          >
            <Copy className="mr-2 h-4 w-4" />
            {t('ws-storage-objects.copy_path')}
          </ContextMenuItem>
          <ContextMenuItem onClick={shareFile}>
            <Share className="mr-2 h-4 w-4" />
            {t('ws-storage-objects.share')}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={downloadStorageObject}>
            <Download className="mr-2 h-4 w-4" />
            {t('common.download')}
          </ContextMenuItem>
          <ContextMenuSeparator />
        </>
      )}
      {!storageObj.id && exportFolderPath ? (
        <>
          <ContextMenuItem onClick={() => setShowExportDialog(true)}>
            <PackageOpen className="mr-2 h-4 w-4" />
            {t('ws-storage-objects.export.folder_action')}
          </ContextMenuItem>
          <ContextMenuSeparator />
        </>
      ) : null}
      <ContextMenuItem onClick={() => onRequestDelete?.(storageObj)}>
        <Trash className="mr-2 h-4 w-4" />
        {t('common.delete')}
      </ContextMenuItem>
    </>
  ) : (
    <>
      {storageObj.id && (
        <>
          <DropdownMenuItem onClick={previewFile}>
            <Eye className="mr-2 h-4 w-4" />
            {t('ws-storage-objects.preview')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={openExternal}>
            <ExternalLink className="mr-2 h-4 w-4" />
            {t('common.view')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </>
      )}
      <DropdownMenuItem onClick={requestRename}>
        <Edit3 className="mr-2 h-4 w-4" />
        {t('common.rename')}
      </DropdownMenuItem>
      {storageObj.id && (
        <>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              copyPath();
            }}
          >
            <Copy className="mr-2 h-4 w-4" />
            {t('ws-storage-objects.copy_path')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={shareFile}>
            <Share className="mr-2 h-4 w-4" />
            {t('ws-storage-objects.share')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={downloadStorageObject}>
            <Download className="mr-2 h-4 w-4" />
            {t('common.download')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </>
      )}
      {!storageObj.id && exportFolderPath ? (
        <>
          <DropdownMenuItem onClick={() => setShowExportDialog(true)}>
            <PackageOpen className="mr-2 h-4 w-4" />
            {t('ws-storage-objects.export.folder_action')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </>
      ) : null}
      <DropdownMenuItem onClick={() => onRequestDelete?.(storageObj)}>
        <Trash className="mr-2 h-4 w-4" />
        {t('common.delete')}
      </DropdownMenuItem>
    </>
  );

  if (menuOnly) {
    return (
      <>
        {menuContent}
        <RenameStorageObjectDialog
          wsId={wsId}
          path={path}
          storageObject={showRenameDialog ? storageObj : null}
          open={showRenameDialog}
          onOpenChange={setShowRenameDialog}
          onSuccess={() => router.refresh()}
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

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <Ellipsis className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-45">
          {menuContent}
        </DropdownMenuContent>
      </DropdownMenu>

      <RenameStorageObjectDialog
        wsId={wsId}
        path={path}
        storageObject={showRenameDialog ? storageObj : null}
        open={showRenameDialog}
        onOpenChange={setShowRenameDialog}
        onSuccess={() => router.refresh()}
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
