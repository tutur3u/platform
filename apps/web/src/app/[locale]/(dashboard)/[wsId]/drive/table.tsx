'use client';

import type { Row } from '@tanstack/react-table';
import { ArrowLeft, LayoutGrid, LayoutList } from '@tuturuuu/icons';
import {
  deleteWorkspaceStorageFolder,
  deleteWorkspaceStorageObject,
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
} from '@tuturuuu/ui/alert-dialog';
import { Button } from '@tuturuuu/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from '@tuturuuu/ui/context-menu';
import { toast } from '@tuturuuu/ui/sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { CustomDataTable } from '@/components/custom-data-table';
import { joinPath, popPath } from '@/utils/path-helper';
import { storageObjectsColumns } from './columns';
import { DriveGridThumbnail } from './drive-grid-thumbnail';
import { FilePreviewDialog } from './file-preview-dialog';
import { RenameStorageObjectDialog } from './rename-storage-object-dialog';
import { StorageObjectRowActions } from './row-actions';
import { getStorageObjectDisplayName } from './storage-display-name';

interface Props {
  wsId: string;
  data: StorageObject[];
  path?: string;
  count: number;
}

export default function StorageObjectsTable({
  wsId,
  data,
  path,
  count,
}: Props) {
  const t = useTranslations();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [storageObj, setStorageObject] = useState<StorageObject | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [deleteTarget, setDeleteTarget] = useState<StorageObject | null>(null);
  const [renameTarget, setRenameTarget] = useState<StorageObject | null>(null);
  const [deleting, setDeleting] = useState(false);

  const navigateToPath = (nextPath: string) => {
    const params = new URLSearchParams(searchParams.toString());

    if (!nextPath || nextPath === '/' || nextPath === '') {
      params.delete('path');
    } else {
      params.set('path', nextPath);
    }

    const queryString = params.toString();
    router.push(`${pathname}${queryString ? `?${queryString}` : ''}`, {
      scroll: false,
    });
  };

  const handleBack = () => {
    const basePath = searchParams.get('path') ?? '';
    const nextPath = popPath(basePath);
    navigateToPath(nextPath);
  };

  // Wrapper function to handle type mismatch
  const handleSetStorageObject = (value: StorageObject | undefined) => {
    setStorageObject(value || null);
  };

  // Handle row click for list view
  const handleRowClick = (row: StorageObject) => {
    // If it's a file (has id), open preview
    if (row.id) {
      setStorageObject(row);
      return;
    }

    // If it's a folder (no id), navigate
    if (row.name) {
      const basePath = searchParams.get('path') ?? '';
      const newPath = joinPath(basePath, row.name);
      navigateToPath(newPath);
    }
  };

  // Handle grid item click
  const handleGridItemClick = (item: StorageObject) => {
    // If it's a file (has id), open preview
    if (item.id) {
      setStorageObject(item);
      return;
    }

    // If it's a folder (no id), navigate
    if (item.name) {
      const basePath = searchParams.get('path') ?? '';
      const newPath = joinPath(basePath, item.name);
      navigateToPath(newPath);
    }
  };

  // Pass a callback to row actions to trigger the delete dialog
  const handleRequestRename = (obj: StorageObject) => setRenameTarget(obj);
  const handleRequestDelete = (obj: StorageObject) => setDeleteTarget(obj);

  const handleDelete = async (storageObj: StorageObject | null) => {
    if (!storageObj?.name) return;
    try {
      if (storageObj.id) {
        await deleteWorkspaceStorageObject(
          wsId,
          joinPath(path ?? '', storageObj.name)
        );
        router.refresh();
        toast.success(t('ws-storage-objects.file_deleted'));
      } else {
        await deleteWorkspaceStorageFolder(wsId, {
          path,
          name: storageObj.name,
        });
        router.refresh();
        toast.success(t('ws-storage-objects.folder_deleted'));
      }
    } catch {
      toast.error('Failed to delete file or folder');
    }
  };

  return (
    <div className="space-y-6">
      {/* View Mode Toggle */}
      <div className="flex items-center justify-between">
        <div className="text-muted-foreground text-sm">
          {t('ws-storage-objects.view_mode')}
        </div>
        <div className="flex rounded-lg border">
          <Button
            variant={viewMode === 'list' ? 'default' : 'ghost'}
            size="sm"
            className="rounded-r-none"
            onClick={() => setViewMode('list')}
          >
            <LayoutList className="mr-2 h-4 w-4" />
            {t('ws-storage-objects.list_view')}
          </Button>
          <Button
            variant={viewMode === 'grid' ? 'default' : 'ghost'}
            size="sm"
            className="rounded-l-none"
            onClick={() => setViewMode('grid')}
          >
            <LayoutGrid className="mr-2 h-4 w-4" />
            {t('ws-storage-objects.grid_view')}
          </Button>
        </div>
      </div>

      {path && path !== '/' && (
        <Button
          variant="ghost"
          size="sm"
          className="w-fit"
          onClick={handleBack}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('common.back')}
        </Button>
      )}

      {/* Data Table/Grid */}
      {viewMode === 'list' ? (
        <CustomDataTable
          data={data}
          columnGenerator={storageObjectsColumns}
          extraData={{
            setStorageObject: handleSetStorageObject,
            wsId,
            path,
            onRequestRename: handleRequestRename,
            onRequestDelete: handleRequestDelete,
          }}
          namespace="storage-object-data-table"
          count={count}
          defaultVisibility={{
            id: false,
            created_at: false,
          }}
          onRowDoubleClick={(rowData) => {
            if (rowData.id) {
              handleRowClick(rowData);
            }
          }}
          rowWrapper={(row, rowData) => {
            // Folder row: clickable and has context menu
            if (!rowData.id) {
              return (
                <ContextMenu key={row.key}>
                  <ContextMenuTrigger asChild>
                    <tr
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => {
                        const basePath = searchParams.get('path') ?? '';
                        const nextPath = joinPath(basePath, rowData.name || '');
                        navigateToPath(nextPath);
                      }}
                    >
                      {(row.props as any)?.children}
                    </tr>
                  </ContextMenuTrigger>
                  <ContextMenuContent forceMount>
                    <StorageObjectRowActions
                      wsId={wsId}
                      row={{ original: rowData } as Row<StorageObject>}
                      path={path}
                      setStorageObject={handleSetStorageObject}
                      menuOnly={true}
                      contextMenu={true}
                      onRequestRename={handleRequestRename}
                      onRequestDelete={handleRequestDelete}
                    />
                  </ContextMenuContent>
                </ContextMenu>
              );
            }
            // File row: context menu and preview
            return (
              <ContextMenu key={row.key}>
                <ContextMenuTrigger
                  asChild
                  onContextMenu={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    if (e.target === e.currentTarget) {
                      handleRowClick(rowData);
                    }
                    e.stopPropagation();
                  }}
                  onDoubleClick={(e) => {
                    if (e.target === e.currentTarget) {
                      handleRowClick(rowData);
                    }
                    e.stopPropagation();
                  }}
                >
                  {row}
                </ContextMenuTrigger>
                <ContextMenuContent forceMount>
                  <StorageObjectRowActions
                    wsId={wsId}
                    row={{ original: rowData } as Row<StorageObject>}
                    path={path}
                    setStorageObject={handleSetStorageObject}
                    menuOnly={true}
                    contextMenu={true}
                    onRequestRename={handleRequestRename}
                    onRequestDelete={handleRequestDelete}
                  />
                </ContextMenuContent>
              </ContextMenu>
            );
          }}
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
          {/* Grid View */}
          {data.map((item) => {
            const displayName = getStorageObjectDisplayName(item);

            return (
              <ContextMenu key={item.id || item.name}>
                <ContextMenuTrigger asChild>
                  <button
                    type="button"
                    className="group relative w-full cursor-pointer rounded-lg border border-dynamic-border bg-card p-4 text-left transition-all hover:shadow-dynamic-blue/10 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => handleGridItemClick(item)}
                    disabled={!item.id && !item.name}
                  >
                    <div className="mb-3 flex aspect-square items-center justify-center rounded-lg bg-muted/50">
                      <DriveGridThumbnail wsId={wsId} path={path} item={item} />
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <h3 className="truncate font-medium text-sm">
                          {displayName}
                        </h3>
                      </TooltipTrigger>
                      <TooltipContent>{displayName}</TooltipContent>
                    </Tooltip>
                    <p className="mt-1 text-muted-foreground text-xs">
                      {item.metadata?.size &&
                        `${Math.round(item.metadata.size / 1024)} KB`}
                    </p>
                  </button>
                </ContextMenuTrigger>
                <ContextMenuContent forceMount>
                  <StorageObjectRowActions
                    wsId={wsId}
                    row={{ original: item } as Row<StorageObject>}
                    path={path}
                    setStorageObject={handleSetStorageObject}
                    menuOnly={true}
                    contextMenu={true}
                    onRequestRename={handleRequestRename}
                    onRequestDelete={handleRequestDelete}
                  />
                </ContextMenuContent>
              </ContextMenu>
            );
          })}

          {data.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-4 text-6xl">📁</div>
              <h3 className="mb-2 font-medium text-lg">
                {t('ws-storage-objects.no_files_found')}
              </h3>
              <p className="text-muted-foreground">
                {t('ws-storage-objects.no_files_description')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* File Preview Dialog */}
      <FilePreviewDialog
        wsId={wsId}
        path={path ?? ''}
        file={storageObj}
        open={!!storageObj}
        onOpenChange={(open) => !open && setStorageObject(null)}
      />

      <RenameStorageObjectDialog
        wsId={wsId}
        path={path}
        storageObject={renameTarget}
        open={!!renameTarget}
        onOpenChange={(open) => {
          if (!open) {
            setRenameTarget(null);
          }
        }}
        onSuccess={() => router.refresh()}
      />

      {/* Render AlertDialog at the table level */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('ws-storage-objects.confirm_delete_title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.id
                ? t('ws-storage-objects.confirm_delete_file', {
                    name: getStorageObjectDisplayName(deleteTarget),
                  })
                : t('ws-storage-objects.confirm_delete_folder', {
                    name: getStorageObjectDisplayName(deleteTarget),
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setDeleting(true);
                await handleDelete(deleteTarget);
                setDeleting(false);
                setDeleteTarget(null);
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? t('ws-storage-objects.deleting') : t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
