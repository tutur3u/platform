'use client';

import type { Row } from '@tanstack/react-table';
import {
  AlertTriangle,
  FileText,
  Folder,
  Loader2,
  Search,
} from '@tuturuuu/icons';
import type { StorageObject } from '@tuturuuu/types/primitives/StorageObject';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from '@tuturuuu/ui/context-menu';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import { formatBytes } from '@/utils/file-helper';
import { joinPath } from '@/utils/path-helper';
import { DriveGridThumbnail } from './drive-grid-thumbnail';
import { StorageObjectRowActions } from './row-actions';

interface DriveExplorerItemsProps {
  wsId: string;
  items: StorageObject[];
  path: string;
  allSelected?: boolean;
  onNavigate: (name: string) => void;
  onPreview: (item: StorageObject | undefined) => void;
  onRequestRename: (item: StorageObject) => void;
  onRequestDelete: (item: StorageObject) => void;
  onSelectAll?: (checked: boolean) => void;
  onToggleSelection?: (item: StorageObject, checked: boolean) => void;
  onMutationSuccess: () => void | Promise<void>;
  selectedKeys?: string[];
}

interface DriveEmptyStateProps {
  hasSearch: boolean;
  hasPath: boolean;
  onResetSearch: () => void;
}

interface DriveErrorStateProps {
  onRetry: () => void;
}

function formatTimestamp(value?: string | null) {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function getDisplayName(item: StorageObject) {
  return (
    item.name?.replace(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i,
      ''
    ) || ''
  );
}

function isFolder(item: StorageObject) {
  return !item.id;
}

function getSelectionKey(path: string, item: StorageObject) {
  return joinPath(path || '/', item.id || item.name || '');
}

export function DriveLoadingState() {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
      <Card className="overflow-hidden rounded-[28px] border-dynamic-border/80">
        <CardContent className="space-y-4 p-5">
          <Skeleton className="h-10 w-40 rounded-full" />
          <Skeleton className="h-16 w-full rounded-3xl" />
          <div className="grid gap-3 md:grid-cols-3">
            <Skeleton className="h-28 rounded-3xl" />
            <Skeleton className="h-28 rounded-3xl" />
            <Skeleton className="h-28 rounded-3xl" />
          </div>
        </CardContent>
      </Card>
      <Card className="rounded-[28px] border-dynamic-border/80">
        <CardContent className="space-y-3 p-5">
          <Skeleton className="h-8 w-36 rounded-full" />
          <Skeleton className="h-28 w-full rounded-3xl" />
          <Skeleton className="h-16 w-full rounded-3xl" />
        </CardContent>
      </Card>
    </div>
  );
}

export function DriveErrorState({ onRetry }: DriveErrorStateProps) {
  const t = useTranslations('ws-storage-objects');

  return (
    <Card className="rounded-[28px] border-dynamic-red/20 bg-dynamic-red/5">
      <CardContent className="flex flex-col items-center gap-4 px-6 py-14 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-dynamic-red/20 bg-background/80">
          <AlertTriangle className="h-6 w-6 text-dynamic-red" />
        </div>
        <div className="space-y-2">
          <h2 className="font-semibold text-lg">{t('error_title')}</h2>
          <p className="max-w-xl text-muted-foreground text-sm">
            {t('error_description')}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={onRetry}>
          <Loader2 className="mr-2 h-4 w-4" />
          {t('retry')}
        </Button>
      </CardContent>
    </Card>
  );
}

export function DriveEmptyState({
  hasSearch,
  hasPath,
  onResetSearch,
}: DriveEmptyStateProps) {
  const t = useTranslations('ws-storage-objects');

  return (
    <Card className="rounded-[28px] border-dynamic-border/80 border-dashed bg-muted/20">
      <CardContent className="flex flex-col items-center gap-5 px-6 py-16 text-center">
        <div className="relative flex h-18 w-18 items-center justify-center rounded-[2rem] border border-dynamic-border bg-background shadow-sm">
          {hasSearch ? (
            <Search className="h-8 w-8 text-dynamic-blue" />
          ) : (
            <Folder className="h-8 w-8 text-dynamic-blue" />
          )}
          <div className="absolute -right-2 -bottom-2 rounded-full border border-dynamic-border bg-background px-2 py-1 font-medium text-[10px] text-muted-foreground uppercase tracking-[0.2em]">
            {hasSearch ? t('search') : t('folder')}
          </div>
        </div>
        <div className="space-y-2">
          <h2 className="font-semibold text-xl">
            {hasSearch
              ? t('empty_search_title')
              : hasPath
                ? t('empty_folder_title')
                : t('empty_root_title')}
          </h2>
          <p className="max-w-2xl text-muted-foreground text-sm leading-6">
            {hasSearch
              ? t('empty_search_description')
              : hasPath
                ? t('empty_folder_description')
                : t('empty_root_description')}
          </p>
        </div>
        {hasSearch ? (
          <Button type="button" variant="outline" onClick={onResetSearch}>
            {t('clear_search')}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function DriveListView({
  allSelected = false,
  wsId,
  items,
  path,
  onNavigate,
  onPreview,
  onRequestRename,
  onRequestDelete,
  onSelectAll,
  onToggleSelection,
  onMutationSuccess,
  selectedKeys = [],
}: DriveExplorerItemsProps) {
  const t = useTranslations('ws-storage-objects');

  return (
    <Card className="overflow-hidden rounded-[28px] border-dynamic-border/80">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/35">
              <TableHead className="w-12">
                <Checkbox
                  aria-label={t('select_all_visible')}
                  checked={allSelected}
                  onCheckedChange={(checked) => onSelectAll?.(checked === true)}
                />
              </TableHead>
              <TableHead>{t('name')}</TableHead>
              <TableHead>{t('file_type')}</TableHead>
              <TableHead>{t('total_size')}</TableHead>
              <TableHead>{t('updated_label')}</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const folder = isFolder(item);
              const displayName = getDisplayName(item);
              const selectionKey = getSelectionKey(path, item);
              const isSelected = selectedKeys.includes(selectionKey);
              const row = (
                <TableRow
                  key={item.id || item.name}
                  className="cursor-pointer border-dynamic-border/70 transition-colors hover:bg-muted/25"
                  onClick={() =>
                    folder ? onNavigate(item.name || '') : onPreview(item)
                  }
                >
                  <TableCell
                    onClick={(event) => event.stopPropagation()}
                    className="w-12"
                  >
                    <Checkbox
                      aria-label={t('select_item', { name: displayName })}
                      checked={isSelected}
                      onCheckedChange={(checked) =>
                        onToggleSelection?.(item, checked === true)
                      }
                    />
                  </TableCell>
                  <TableCell className="min-w-72">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-dynamic-border bg-muted/30">
                        {folder ? (
                          <Folder className="h-5 w-5 text-dynamic-blue" />
                        ) : (
                          <FileText className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0 space-y-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="truncate font-medium">
                              {displayName}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>{displayName}</TooltipContent>
                        </Tooltip>
                        {folder ? (
                          <p className="text-muted-foreground text-xs">
                            {t('folder_quick_hint')}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className="border-dynamic-border bg-background/80"
                    >
                      {folder ? t('folder') : t('files')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {folder ? '-' : formatBytes(item.metadata?.size ?? 0)}
                  </TableCell>
                  <TableCell>{formatTimestamp(item.updated_at)}</TableCell>
                  <TableCell className="text-right">
                    <StorageObjectRowActions
                      wsId={wsId}
                      row={{ original: item } as Row<StorageObject>}
                      path={path}
                      setStorageObject={onPreview}
                      onRequestRename={onRequestRename}
                      onRequestDelete={onRequestDelete}
                      onMutationSuccess={onMutationSuccess}
                    />
                  </TableCell>
                </TableRow>
              );

              return (
                <ContextMenu key={item.id || item.name}>
                  <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
                  <ContextMenuContent forceMount>
                    <StorageObjectRowActions
                      wsId={wsId}
                      row={{ original: item } as Row<StorageObject>}
                      path={path}
                      setStorageObject={onPreview}
                      menuOnly
                      contextMenu
                      onRequestRename={onRequestRename}
                      onRequestDelete={onRequestDelete}
                      onMutationSuccess={onMutationSuccess}
                    />
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

export function DriveGridView({
  allSelected = false,
  wsId,
  items,
  path,
  onNavigate,
  onPreview,
  onRequestRename,
  onRequestDelete,
  onSelectAll,
  onToggleSelection,
  onMutationSuccess,
  selectedKeys = [],
}: DriveExplorerItemsProps) {
  const t = useTranslations('ws-storage-objects');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-2 rounded-2xl border border-dynamic-border/80 bg-background px-3 py-2 text-sm">
          <Checkbox
            aria-label={t('select_all_visible')}
            checked={allSelected}
            onCheckedChange={(checked) => onSelectAll?.(checked === true)}
          />
          <span className="text-muted-foreground">
            {t('select_all_visible')}
          </span>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {items.map((item) => {
          const folder = isFolder(item);
          const displayName = getDisplayName(item);
          const selectionKey = getSelectionKey(path, item);
          const isSelected = selectedKeys.includes(selectionKey);

          return (
            <ContextMenu key={item.id || item.name}>
              <ContextMenuTrigger asChild>
                <div
                  className={`group relative flex h-full flex-col overflow-hidden rounded-[26px] border text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg ${
                    isSelected
                      ? 'border-primary/70 ring-1 ring-primary/30'
                      : 'border-dynamic-border/80 bg-card'
                  }`}
                >
                  <button
                    type="button"
                    className="absolute inset-0 z-10 rounded-[26px]"
                    aria-label={displayName}
                    onClick={() =>
                      folder ? onNavigate(item.name || '') : onPreview(item)
                    }
                  />
                  <div className="relative aspect-[1.08/1] overflow-hidden border-dynamic-border/60 border-b bg-linear-to-br from-dynamic-blue/6 via-background to-dynamic-cyan/6">
                    <div
                      className="absolute top-3 left-3 z-20"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Checkbox
                        aria-label={t('select_item', { name: displayName })}
                        checked={isSelected}
                        onCheckedChange={(checked) =>
                          onToggleSelection?.(item, checked === true)
                        }
                      />
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center p-5">
                      <div className="flex h-full w-full items-center justify-center rounded-[22px] border border-dynamic-border/70 bg-background/75 shadow-inner">
                        <DriveGridThumbnail
                          wsId={wsId}
                          path={path}
                          item={item}
                        />
                      </div>
                    </div>
                    <div className="absolute top-3 right-3">
                      <Badge className="border-dynamic-border/70 bg-background/85 text-foreground hover:bg-background/85">
                        {folder ? t('folder') : t('files')}
                      </Badge>
                    </div>
                  </div>
                  <div className="relative z-20 flex flex-1 flex-col gap-4 p-4">
                    <div className="space-y-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <h3 className="line-clamp-2 font-semibold text-sm leading-6">
                            {displayName}
                          </h3>
                        </TooltipTrigger>
                        <TooltipContent>{displayName}</TooltipContent>
                      </Tooltip>
                      <p className="text-muted-foreground text-xs">
                        {folder
                          ? t('folder_quick_hint')
                          : formatTimestamp(item.updated_at)}
                      </p>
                    </div>
                    <div className="mt-auto flex items-center justify-between gap-3">
                      <div className="font-medium text-muted-foreground text-xs">
                        {folder ? '-' : formatBytes(item.metadata?.size ?? 0)}
                      </div>
                      <div onClick={(event) => event.stopPropagation()}>
                        <StorageObjectRowActions
                          wsId={wsId}
                          row={{ original: item } as Row<StorageObject>}
                          path={path}
                          setStorageObject={onPreview}
                          onRequestRename={onRequestRename}
                          onRequestDelete={onRequestDelete}
                          onMutationSuccess={onMutationSuccess}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent forceMount>
                <StorageObjectRowActions
                  wsId={wsId}
                  row={{ original: item } as Row<StorageObject>}
                  path={path}
                  setStorageObject={onPreview}
                  menuOnly
                  contextMenu
                  onRequestRename={onRequestRename}
                  onRequestDelete={onRequestDelete}
                  onMutationSuccess={onMutationSuccess}
                />
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>
    </div>
  );
}
