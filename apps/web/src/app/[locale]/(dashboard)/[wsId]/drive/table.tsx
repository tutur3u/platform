'use client';

import type { Row } from '@tanstack/react-table';
import {
  ArrowLeft,
  FileText,
  Folder,
  LayoutGrid,
  LayoutList,
} from '@tuturuuu/icons';
import { createDynamicClient } from '@tuturuuu/supabase/next/client';
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
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { CustomDataTable } from '@/components/custom-data-table';
import { joinPath, popPath } from '@/utils/path-helper';
import { storageObjectsColumns } from './columns';
import { FilePreviewDialog } from './file-preview-dialog';
import { StorageObjectRowActions } from './row-actions';

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
  const [deleting, setDeleting] = useState(false);

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

    // If it's a folder or back button (no id), navigate
    if (row.name) {
      const basePath = searchParams.get('path') ?? '';
      const newPath =
        row.name === '...' ? popPath(basePath) : joinPath(basePath, row.name);

      // Navigate to the new path
      const params = new URLSearchParams(searchParams.toString());
      if (!newPath || newPath === '/' || newPath === '') {
        params.delete('path');
      } else {
        params.set('path', newPath);
      }
      const queryString = params.toString();
      router.push(`${pathname}${queryString ? `?${queryString}` : ''}`, {
        scroll: false,
      });
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

      // Navigate to the new path
      const params = new URLSearchParams(searchParams.toString());
      if (!newPath || newPath === '/' || newPath === '') {
        params.delete('path');
      } else {
        params.set('path', newPath);
      }
      const queryString = params.toString();
      router.push(`${pathname}${queryString ? `?${queryString}` : ''}`, {
        scroll: false,
      });
    }
  };

  // Pass a callback to row actions to trigger the delete dialog
  const handleRequestDelete = (obj: StorageObject) => setDeleteTarget(obj);

  const handleDelete = async (storageObj: StorageObject | null) => {
    if (!storageObj?.name) return;
    const supabase = createDynamicClient();
    try {
      if (storageObj.id) {
        // File
        const filePath =
          wsId && path !== undefined && storageObj.name
            ? joinPath(wsId, path, storageObj.name)
            : '';
        const { error } = await supabase.storage
          .from('workspaces')
          .remove([filePath]);
        if (!error) {
          router.refresh();
          toast.success(t('ws-storage-objects.file_deleted'));
        } else {
          toast.error(error.message);
        }
      } else {
        // Folder
        const folderPath =
          wsId && path !== undefined && storageObj.name
            ? joinPath(wsId, path, storageObj.name, '%')
            : '';
        const objects = await supabase
          .schema('storage')
          .from('objects')
          .select()
          .ilike('name', folderPath);
        if (objects.error) {
          toast.error(objects.error.message);
          return;
        }
        const { error } = await supabase.storage
          .from('workspaces')
          .remove(objects.data.map((object: { name: string }) => object.name));
        if (!error) {
          router.refresh();
          toast.success(t('ws-storage-objects.folder_deleted'));
        } else {
          toast.error(error.message);
        }
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

      {/* Data Table/Grid */}
      {viewMode === 'list' ? (
        <CustomDataTable
          data={!path || path === '/' ? data : [{ name: '...' }, ...data]}
          columnGenerator={(t: any, namespace: string | undefined) =>
            storageObjectsColumns(
              t,
              namespace,
              handleSetStorageObject,
              wsId,
              path,
              handleRequestDelete
            )
          }
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
            // Back row: just clickable, no context menu
            if (rowData.name === '...') {
              return (
                <tr
                  key={row.key}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => {
                    const basePath = searchParams.get('path') ?? '';
                    const nextPath = popPath(basePath);
                    const params = new URLSearchParams(searchParams.toString());
                    if (!nextPath || nextPath === '/' || nextPath === '') {
                      params.delete('path');
                    } else {
                      params.set('path', nextPath);
                    }
                    const queryString = params.toString();
                    router.push(
                      `${pathname}${queryString ? `?${queryString}` : ''}`,
                      { scroll: false }
                    );
                  }}
                >
                  {(row.props as any)?.children}
                </tr>
              );
            }
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
                        const params = new URLSearchParams(
                          searchParams.toString()
                        );
                        if (!nextPath || nextPath === '/' || nextPath === '') {
                          params.delete('path');
                        } else {
                          params.set('path', nextPath);
                        }
                        const queryString = params.toString();
                        router.push(
                          `${pathname}${queryString ? `?${queryString}` : ''}`,
                          { scroll: false }
                        );
                      }}
                    >
                      {(row.props as any)?.children}
                    </tr>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <StorageObjectRowActions
                      wsId={wsId}
                      row={{ original: rowData } as Row<StorageObject>}
                      path={path}
                      setStorageObject={handleSetStorageObject}
                      menuOnly={true}
                      contextMenu={true}
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
                <ContextMenuContent>
                  <StorageObjectRowActions
                    wsId={wsId}
                    row={{ original: rowData } as Row<StorageObject>}
                    path={path}
                    setStorageObject={handleSetStorageObject}
                    menuOnly={true}
                    contextMenu={true}
                    onRequestDelete={handleRequestDelete}
                  />
                </ContextMenuContent>
              </ContextMenu>
            );
          }}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {/* Back button for grid view */}
          {path && path !== '/' && (
            <button
              type="button"
              className="group relative w-full cursor-pointer rounded-lg border border-dynamic-border bg-card p-4 text-left transition-all hover:shadow-dynamic-blue/10 hover:shadow-lg"
              onClick={() => {
                const basePath = searchParams.get('path') ?? '';
                const newPath = popPath(basePath);
                const params = new URLSearchParams(searchParams.toString());
                if (!newPath || newPath === '/' || newPath === '') {
                  params.delete('path');
                } else {
                  params.set('path', newPath);
                }
                const queryString = params.toString();
                router.push(
                  `${pathname}${queryString ? `?${queryString}` : ''}`,
                  { scroll: false }
                );
              }}
            >
              <div className="mb-3 flex aspect-square items-center justify-center rounded-lg bg-muted/50">
                <div className="text-4xl text-muted-foreground">
                  <ArrowLeft />
                </div>
              </div>
              <h3 className="truncate font-medium text-sm">
                {t('common.back')}
              </h3>
              <p className="mt-1 text-muted-foreground text-xs">
                {t('ws-storage-objects.go_back')}
              </p>
            </button>
          )}

          {/* Grid View */}
          {data.map((item) => (
            <ContextMenu key={item.id || item.name}>
              <ContextMenuTrigger asChild>
                <button
                  type="button"
                  className="group relative w-full cursor-pointer rounded-lg border border-dynamic-border bg-card p-4 text-left transition-all hover:shadow-dynamic-blue/10 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => handleGridItemClick(item)}
                  disabled={!item.id && !item.name}
                >
                  <div className="mb-3 flex aspect-square items-center justify-center rounded-lg bg-muted/50">
                    {/* File type icon or preview thumbnail */}
                    <div className="text-4xl text-muted-foreground">
                      {item.id ? <FileText /> : <Folder />}
                    </div>
                  </div>
                  <h3 className="truncate font-medium text-sm">
                    {item.name?.replace(
                      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i,
                      ''
                    )}
                  </h3>
                  <p className="mt-1 text-muted-foreground text-xs">
                    {item.metadata?.size &&
                      `${Math.round(item.metadata.size / 1024)} KB`}
                  </p>
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <StorageObjectRowActions
                  wsId={wsId}
                  row={{ original: item } as Row<StorageObject>}
                  path={path}
                  setStorageObject={handleSetStorageObject}
                  menuOnly={true}
                  contextMenu={true}
                  onRequestDelete={handleRequestDelete}
                />
              </ContextMenuContent>
            </ContextMenu>
          ))}

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
                    name: deleteTarget?.name || '',
                  })
                : t('ws-storage-objects.confirm_delete_folder', {
                    name: deleteTarget?.name || '',
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
