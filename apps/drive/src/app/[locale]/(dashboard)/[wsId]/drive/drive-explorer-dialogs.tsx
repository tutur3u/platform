'use client';

import { resolvePreviewIndex } from './drive-dialog-state';
import { DriveDeleteDialog } from './drive-delete-dialog';
import { DriveMoveDialog } from './drive-move-dialog';
import { DriveNewFolderDialog } from './drive-new-folder-dialog';
import { DrivePreviewViewer } from './drive-preview-viewer';
import { DriveShareDialog } from './drive-share-dialog';
import { WorkspaceStorageExportLinksDialog } from './export-links-dialog';
import { RenameStorageObjectDialog } from './rename-storage-object-dialog';
import type { DriveExplorerController } from './use-drive-explorer-controller';

/** Renders the preview viewer and the one open action dialog. */
export function DriveExplorerDialogs({
  drive,
  wsId,
}: {
  drive: DriveExplorerController;
  wsId: string;
}) {
  const { closeDialog, currentPath, dialog } = drive;
  const previewIndex = resolvePreviewIndex(drive.preview, drive.visibleFiles);
  const onOpenChange = (open: boolean) => {
    if (!open) closeDialog();
  };

  const actionDialog = (() => {
    switch (dialog.kind) {
      case 'none':
      case 'delete':
        return null;
      case 'new-folder':
        return (
          <DriveNewFolderDialog
            folderLabel={drive.folderLabel}
            onCreated={drive.invalidate}
            onOpenChange={onOpenChange}
            open
            path={currentPath}
            wsId={wsId}
          />
        );
      case 'rename':
        return (
          <RenameStorageObjectDialog
            onOpenChange={onOpenChange}
            onSuccess={() => void drive.invalidate()}
            open
            path={currentPath || undefined}
            storageObject={dialog.item}
            wsId={wsId}
          />
        );
      case 'move':
        return (
          <DriveMoveDialog
            items={dialog.items}
            onMoved={async () => {
              drive.selection.setSelectedKeys([]);
              await drive.invalidate();
            }}
            onOpenChange={onOpenChange}
            sourcePath={currentPath}
            wsId={wsId}
          />
        );
      case 'share-file':
        return (
          <DriveShareDialog
            file={dialog.item}
            onOpenChange={onOpenChange}
            path={currentPath}
            wsId={wsId}
          />
        );
      case 'share-folder': {
        const name = dialog.item.name ?? '';
        return (
          <WorkspaceStorageExportLinksDialog
            folderName={name}
            folderPath={currentPath ? `${currentPath}/${name}` : name}
            onOpenChange={onOpenChange}
            open
            wsId={wsId}
          />
        );
      }
      default: {
        const exhaustive: never = dialog;
        return exhaustive;
      }
    }
  })();

  return (
    <>
      {previewIndex >= 0 ? (
        <DrivePreviewViewer
          actions={drive.actions}
          files={drive.visibleFiles}
          folderLabel={drive.folderLabel}
          index={previewIndex}
          onClose={() => drive.setPreview({ kind: 'closed' })}
          onIndexChange={(index) => {
            const file = drive.visibleFiles[index];
            if (file?.id) drive.setPreview({ kind: 'open', fileId: file.id });
          }}
          path={currentPath}
          wsId={wsId}
        />
      ) : null}
      {actionDialog}
      <DriveDeleteDialog
        isPending={drive.deleteMutation.isPending}
        items={dialog.kind === 'delete' ? dialog.items : null}
        onConfirm={(items) => drive.deleteMutation.mutate(items)}
        onOpenChange={onOpenChange}
      />
    </>
  );
}
