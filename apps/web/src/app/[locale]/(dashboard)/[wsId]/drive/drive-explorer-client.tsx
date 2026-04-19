'use client';

import { useMutation } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  CheckSquare,
  HardDrive,
  LayoutGrid,
  LayoutList,
  Loader2,
  RefreshCw,
  Search,
} from '@tuturuuu/icons';
import {
  deleteWorkspaceStorageFolder,
  deleteWorkspaceStorageObjects,
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
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useQueryStates } from 'nuqs';
import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { formatBytes } from '@/utils/file-helper';
import { joinPath } from '@/utils/path-helper';
import DriveBreadcrumbs from './breadcrumbs';
import {
  DriveEmptyState,
  DriveErrorState,
  DriveGridView,
  DriveListView,
  DriveLoadingState,
} from './drive-explorer-views';
import { WorkspaceStorageExportLinksButton } from './export-links-dialog';
import { FilePreviewDialog } from './file-preview-dialog';
import NewActions from './new-actions';
import { RenameStorageObjectDialog } from './rename-storage-object-dialog';
import {
  type DriveSortBy,
  type DriveViewMode,
  driveSearchParamParsers,
  driveSortByValues,
  driveViewModes,
} from './search-params';
import {
  useInvalidateDriveQueries,
  useWorkspaceStorageAnalyticsQuery,
  useWorkspaceStorageDirectoryQuery,
} from './use-drive-queries';

interface DriveExplorerClientProps {
  wsId: string;
}

function getUsageTone(usagePercentage: number) {
  if (usagePercentage >= 95) {
    return {
      bar: 'bg-dynamic-red',
      badge: 'border-dynamic-red/20 bg-dynamic-red/10 text-dynamic-red',
      card: 'from-dynamic-red/8 via-dynamic-orange/8 to-background',
      label: 'critical',
    } as const;
  }

  if (usagePercentage >= 80) {
    return {
      bar: 'bg-dynamic-orange',
      badge:
        'border-dynamic-orange/20 bg-dynamic-orange/10 text-dynamic-orange',
      card: 'from-dynamic-orange/8 via-dynamic-yellow/8 to-background',
      label: 'warning',
    } as const;
  }

  return {
    bar: 'bg-dynamic-blue',
    badge: 'border-dynamic-blue/20 bg-dynamic-blue/10 text-dynamic-blue',
    card: 'from-dynamic-blue/8 via-dynamic-cyan/8 to-background',
    label: 'healthy',
  } as const;
}

function getUsageStateLabelKey(label: 'healthy' | 'warning' | 'critical') {
  switch (label) {
    case 'critical':
      return 'storage_state_critical';
    case 'warning':
      return 'storage_state_warning';
    default:
      return 'storage_state_healthy';
  }
}

function getPathSegments(path: string) {
  return path.split('/').filter(Boolean);
}

function getSelectionKey(path: string, item: StorageObject) {
  return joinPath(path || '/', item.id || item.name || '');
}

export default function DriveExplorerClient({
  wsId,
}: DriveExplorerClientProps) {
  const t = useTranslations('ws-storage-objects');
  const commonT = useTranslations('common');
  const [searchState, setSearchState] = useQueryStates(driveSearchParamParsers);
  const [selectedItem, setSelectedItem] = useState<StorageObject | null>(null);
  const [renameTarget, setRenameTarget] = useState<StorageObject | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StorageObject | null>(null);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const deferredQuery = useDeferredValue(searchState.q);
  const invalidateDriveQueries = useInvalidateDriveQueries(wsId);

  const normalizedSearchState = useMemo(
    () => ({
      ...searchState,
      q: deferredQuery,
    }),
    [deferredQuery, searchState]
  );

  const directoryQuery = useWorkspaceStorageDirectoryQuery(
    wsId,
    normalizedSearchState
  );
  const analyticsQuery = useWorkspaceStorageAnalyticsQuery(wsId);

  const items = directoryQuery.data?.items ?? [];
  const total = directoryQuery.data?.total ?? 0;
  const currentFolderCount = items.filter((item) => !item.id).length;
  const currentFileCount = items.length - currentFolderCount;
  const currentPath = searchState.path;
  const pathSegments = getPathSegments(currentPath);
  const usagePercentage = analyticsQuery.data?.usagePercentage ?? 0;
  const usageTone = getUsageTone(usagePercentage);
  const showingCount = items.length;
  const hasMoreResults = directoryQuery.hasNextPage ?? false;
  const selectedItems = useMemo(() => {
    const itemMap = new Map(
      items.map((item) => [getSelectionKey(currentPath, item), item])
    );

    return selectedKeys
      .map((key) => itemMap.get(key))
      .filter((item): item is StorageObject => Boolean(item));
  }, [currentPath, items, selectedKeys]);
  const allVisibleSelected =
    items.length > 0 &&
    items.every((item) =>
      selectedKeys.includes(getSelectionKey(currentPath, item))
    );

  const updateSearchState = useCallback(
    (
      updates: Partial<{
        path: string | null;
        q: string | null;
        sortBy: DriveSortBy;
        sortOrder: 'asc' | 'desc';
        view: DriveViewMode;
      }>
    ) => {
      startTransition(() => {
        void setSearchState(updates);
      });
    },
    [setSearchState]
  );

  const handleNavigateToPath = useCallback(
    (nextPath: string) => {
      updateSearchState({
        path: nextPath || null,
      });
    },
    [updateSearchState]
  );

  const handleNavigateIntoFolder = useCallback(
    (name: string) => {
      const nextPath = currentPath ? `${currentPath}/${name}` : name;
      handleNavigateToPath(nextPath);
    },
    [currentPath, handleNavigateToPath]
  );

  const handleRefresh = useCallback(async () => {
    await invalidateDriveQueries();
  }, [invalidateDriveQueries]);

  const toggleSelectedItem = useCallback(
    (item: StorageObject, checked: boolean) => {
      const selectionKey = getSelectionKey(currentPath, item);

      setSelectedKeys((current) =>
        checked
          ? Array.from(new Set([...current, selectionKey]))
          : current.filter((key) => key !== selectionKey)
      );
    },
    [currentPath]
  );

  const handleSelectAllVisible = useCallback(
    (checked: boolean) => {
      const visibleKeys = items.map((item) =>
        getSelectionKey(currentPath, item)
      );

      setSelectedKeys((current) =>
        checked
          ? Array.from(new Set([...current, ...visibleKeys]))
          : current.filter((key) => !visibleKeys.includes(key))
      );
    },
    [currentPath, items]
  );

  const handleNavigateUp = useCallback(() => {
    if (!currentPath) {
      return;
    }

    const parentSegments = pathSegments.slice(0, -1);
    handleNavigateToPath(parentSegments.join('/'));
  }, [currentPath, handleNavigateToPath, pathSegments]);

  useEffect(() => {
    const visibleKeys = new Set(
      items.map((item) => getSelectionKey(currentPath, item))
    );

    setSelectedKeys((current) => {
      const next = current.filter((key) => visibleKeys.has(key));

      if (
        next.length === current.length &&
        next.every((key, index) => key === current[index])
      ) {
        return current;
      }

      return next;
    });
  }, [currentPath, items]);

  const deleteMutation = useMutation({
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
              {
                path: currentPath || undefined,
                name: target.name,
              },
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
      await invalidateDriveQueries();
      setSelectedKeys([]);
      if (result.count === 1 && result.hasFolders && !result.hasFiles) {
        toast.success(t('folder_deleted'));
        return;
      }

      if (result.count === 1 && result.hasFiles && !result.hasFolders) {
        toast.success(t('file_deleted'));
        return;
      }

      toast.success(
        t('bulk_delete_success', {
          count: result.count,
        })
      );
    },
    onError: () => {
      toast.error(t('delete_failed'));
    },
    onSettled: () => {
      setDeleteTarget(null);
      setBulkDeleteDialogOpen(false);
    },
  });

  const directoryLabel = pathSegments.at(-1) || t('root_label');

  return (
    <div className="space-y-6">
      <Card
        className={`overflow-hidden rounded-[32px] border-dynamic-border/80 bg-linear-to-br ${usageTone.card}`}
      >
        <CardContent className="relative px-6 py-6 sm:px-8 sm:py-8">
          <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/3 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.16),transparent_58%)] lg:block" />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.75fr)] lg:items-start">
            <div className="space-y-5">
              <Badge className="border-dynamic-border bg-background/70 text-foreground hover:bg-background/70">
                <HardDrive className="mr-2 h-4 w-4 text-dynamic-blue" />
                {t('workspace_drive_badge')}
              </Badge>

              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="font-semibold text-3xl tracking-tight">
                    {t('name')}
                  </h1>
                  <Badge className={usageTone.badge}>
                    {t(getUsageStateLabelKey(usageTone.label))}
                  </Badge>
                  {directoryQuery.isFetching || analyticsQuery.isFetching ? (
                    <Badge className="border-dynamic-border bg-background/70 text-foreground hover:bg-background/70">
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      {t('syncing')}
                    </Badge>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {currentPath ? (
                  <WorkspaceStorageExportLinksButton
                    wsId={wsId}
                    folderPath={currentPath}
                    folderName={directoryLabel}
                  />
                ) : null}
                <NewActions
                  wsId={wsId}
                  path={currentPath || undefined}
                  onComplete={handleRefresh}
                />
              </div>
            </div>

            <Card className="rounded-[28px] border-dynamic-border/80 bg-background/85 shadow-sm backdrop-blur">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{t('storage_health')}</p>
                      <Badge className={usageTone.badge}>
                        {usagePercentage.toFixed(2)}%
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
                      <span>
                        {formatBytes(analyticsQuery.data?.totalSize ?? 0)} /{' '}
                        {formatBytes(analyticsQuery.data?.storageLimit ?? 0)}
                      </span>
                      <span>
                        {t('total_files')}:{' '}
                        {analyticsQuery.data?.fileCount ?? 0}
                      </span>
                      <span className="truncate">
                        {t('focus_directory')}: {directoryLabel}
                      </span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="rounded-xl"
                    aria-expanded={isSummaryExpanded}
                    onClick={() => setIsSummaryExpanded((current) => !current)}
                  >
                    {isSummaryExpanded
                      ? t('summary_collapse')
                      : t('summary_expand')}
                  </Button>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${usageTone.bar}`}
                    style={{ width: `${Math.min(100, usagePercentage)}%` }}
                  />
                </div>

                {isSummaryExpanded ? (
                  <>
                    <Separator />

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                      <div className="rounded-[24px] border border-dynamic-border/80 bg-muted/20 p-4">
                        <p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                          {t('largest_file')}
                        </p>
                        <p className="mt-2 font-semibold text-lg">
                          {analyticsQuery.data?.largestFile?.size
                            ? formatBytes(analyticsQuery.data.largestFile.size)
                            : '-'}
                        </p>
                        <p className="mt-1 truncate text-muted-foreground text-xs">
                          {analyticsQuery.data?.largestFile?.name ||
                            t('not_available')}
                        </p>
                      </div>
                      <div className="rounded-[24px] border border-dynamic-border/80 bg-muted/20 p-4">
                        <p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                          {t('smallest_file')}
                        </p>
                        <p className="mt-2 font-semibold text-lg">
                          {analyticsQuery.data?.smallestFile?.size
                            ? formatBytes(analyticsQuery.data.smallestFile.size)
                            : '-'}
                        </p>
                        <p className="mt-1 truncate text-muted-foreground text-xs">
                          {analyticsQuery.data?.smallestFile?.name ||
                            t('not_available')}
                        </p>
                      </div>
                    </div>
                  </>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      <Card className="sticky top-4 z-20 rounded-[28px] border-dynamic-border/80 bg-background/90 shadow-sm backdrop-blur">
        <CardContent className="space-y-5 p-5">
          <DriveBreadcrumbs
            path={currentPath}
            onNavigate={handleNavigateToPath}
            onNavigateUp={handleNavigateUp}
          />

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_13rem_11rem_auto_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchState.q}
                onChange={(event) =>
                  updateSearchState({
                    q: event.target.value || null,
                  })
                }
                placeholder={t('search_placeholder')}
                className="h-11 rounded-2xl border-dynamic-border/80 bg-background pl-11"
              />
            </div>

            <Select
              value={searchState.sortBy}
              onValueChange={(value) =>
                updateSearchState({
                  sortBy: value as DriveSortBy,
                })
              }
            >
              <SelectTrigger className="h-11 rounded-2xl border-dynamic-border/80 bg-background">
                <SelectValue placeholder={t('sort_by_label')} />
              </SelectTrigger>
              <SelectContent>
                {driveSortByValues.map((sortBy) => (
                  <SelectItem key={sortBy} value={sortBy}>
                    {t(`sort_options.${sortBy}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={searchState.sortOrder}
              onValueChange={(value) =>
                updateSearchState({
                  sortOrder: value as 'asc' | 'desc',
                })
              }
            >
              <SelectTrigger className="h-11 rounded-2xl border-dynamic-border/80 bg-background">
                <SelectValue placeholder={t('sort_direction')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">
                  <div className="flex items-center gap-2">
                    <ArrowDown className="h-4 w-4" />
                    {t('sort_desc')}
                  </div>
                </SelectItem>
                <SelectItem value="asc">
                  <div className="flex items-center gap-2">
                    <ArrowUp className="h-4 w-4" />
                    {t('sort_asc')}
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center rounded-2xl border border-dynamic-border/80 bg-background p-1">
              {driveViewModes.map((viewMode) => {
                const Icon = viewMode === 'grid' ? LayoutGrid : LayoutList;
                return (
                  <Button
                    key={viewMode}
                    type="button"
                    variant={
                      searchState.view === viewMode ? 'default' : 'ghost'
                    }
                    className="h-9 rounded-xl"
                    onClick={() =>
                      updateSearchState({
                        view: viewMode,
                      })
                    }
                  >
                    <Icon className="mr-2 h-4 w-4" />
                    {viewMode === 'grid' ? t('grid_view') : t('list_view')}
                  </Button>
                );
              })}
            </div>

            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-2xl border-dynamic-border/80"
              onClick={() => void handleRefresh()}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              {t('refresh')}
            </Button>
          </div>

          {!directoryQuery.isPending && !directoryQuery.isError ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-dynamic-border/60 border-t pt-1 text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground/85">
                {t('results_summary', {
                  from: showingCount === 0 ? 0 : 1,
                  to: showingCount,
                  total,
                })}
              </span>
              <span className="hidden text-muted-foreground/50 sm:inline">
                /
              </span>
              <span>{`${currentFolderCount} ${t('folder_count_label').toLowerCase()}`}</span>
              <span className="hidden text-muted-foreground/50 sm:inline">
                /
              </span>
              <span>{`${currentFileCount} ${t('file_count_label').toLowerCase()}`}</span>
              {searchState.q ? (
                <>
                  <span className="hidden text-muted-foreground/50 sm:inline">
                    /
                  </span>
                  <span className="truncate">
                    {t('search')}: "{searchState.q}"
                  </span>
                </>
              ) : null}
              {currentPath ? (
                <>
                  <span className="hidden text-muted-foreground/50 sm:inline">
                    /
                  </span>
                  <span className="truncate">{directoryLabel}</span>
                </>
              ) : null}
              <span className="sr-only">
                {t('results_hint', {
                  folders: currentFolderCount,
                  files: currentFileCount,
                })}
              </span>
            </div>
          ) : null}

          {selectedItems.length > 0 ? (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dynamic-border/80 bg-muted/20 px-3 py-3">
              <div className="flex items-center gap-2 font-medium text-foreground text-sm">
                <CheckSquare className="h-4 w-4 text-dynamic-blue" />
                {t('bulk_selection_count', {
                  count: selectedItems.length,
                })}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl"
                onClick={() => handleSelectAllVisible(true)}
              >
                {t('select_all_visible')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-xl"
                onClick={() => setSelectedKeys([])}
              >
                {t('deselect_all')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="rounded-xl"
                onClick={() => setBulkDeleteDialogOpen(true)}
              >
                {t('bulk_delete_action')}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {directoryQuery.isPending && !directoryQuery.data ? (
        <DriveLoadingState />
      ) : directoryQuery.isError ? (
        <DriveErrorState onRetry={() => void directoryQuery.refetch()} />
      ) : analyticsQuery.isError ? (
        <DriveErrorState onRetry={() => void analyticsQuery.refetch()} />
      ) : items.length === 0 ? (
        <DriveEmptyState
          hasSearch={Boolean(searchState.q)}
          hasPath={Boolean(currentPath)}
          onResetSearch={() =>
            updateSearchState({
              q: null,
            })
          }
        />
      ) : (
        <div className="space-y-5">
          {searchState.view === 'list' ? (
            <DriveListView
              allSelected={allVisibleSelected}
              wsId={wsId}
              items={items}
              path={currentPath}
              onNavigate={handleNavigateIntoFolder}
              onPreview={(item) => setSelectedItem(item ?? null)}
              onRequestRename={setRenameTarget}
              onRequestDelete={setDeleteTarget}
              onSelectAll={handleSelectAllVisible}
              onToggleSelection={toggleSelectedItem}
              onMutationSuccess={handleRefresh}
              selectedKeys={selectedKeys}
            />
          ) : (
            <DriveGridView
              allSelected={allVisibleSelected}
              wsId={wsId}
              items={items}
              path={currentPath}
              onNavigate={handleNavigateIntoFolder}
              onPreview={(item) => setSelectedItem(item ?? null)}
              onRequestRename={setRenameTarget}
              onRequestDelete={setDeleteTarget}
              onSelectAll={handleSelectAllVisible}
              onToggleSelection={toggleSelectedItem}
              onMutationSuccess={handleRefresh}
              selectedKeys={selectedKeys}
            />
          )}

          {hasMoreResults ? (
            <Card className="rounded-[28px] border-dynamic-border/80">
              <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-muted-foreground text-sm">
                  {t('loaded_summary', {
                    current: showingCount,
                    total,
                  })}
                </div>
                <Button
                  type="button"
                  className="rounded-2xl"
                  disabled={directoryQuery.isFetchingNextPage}
                  onClick={() => void directoryQuery.fetchNextPage()}
                >
                  {directoryQuery.isFetchingNextPage ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('loading_more')}
                    </>
                  ) : (
                    commonT('load_more')
                  )}
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}

      <FilePreviewDialog
        wsId={wsId}
        path={currentPath}
        file={selectedItem}
        open={!!selectedItem}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedItem(null);
          }
        }}
      />

      <RenameStorageObjectDialog
        wsId={wsId}
        path={currentPath || undefined}
        storageObject={renameTarget}
        open={!!renameTarget}
        onOpenChange={(open) => {
          if (!open) {
            setRenameTarget(null);
          }
        }}
        onSuccess={() => void handleRefresh()}
      />

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
                    name: deleteTarget.name || '',
                  })
                : t('confirm_delete_folder', {
                    name: deleteTarget?.name || '',
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
                if (!deleteTarget) {
                  return;
                }

                void deleteMutation.mutateAsync([deleteTarget]);
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
                if (selectedItems.length === 0) {
                  return;
                }

                void deleteMutation.mutateAsync(selectedItems);
              }}
            >
              {deleteMutation.isPending ? t('deleting') : commonT('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
