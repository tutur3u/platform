'use client';

import type { Row } from '@tanstack/react-table';
import type { StorageObject } from '@tuturuuu/types/primitives/StorageObject';
import { Badge } from '@tuturuuu/ui/badge';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from '@tuturuuu/ui/context-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { formatBytes } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { DriveGridThumbnail } from './drive-grid-thumbnail';
import { getSelectionKey } from './drive-selection';
import {
  type DriveExplorerItemsProps,
  formatTimestamp,
  isFolder,
} from './drive-view-helpers';
import { StorageObjectRowActions } from './row-actions';
import { getStorageObjectDisplayName } from './storage-display-name';

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
        {items.map((item) => (
          <DriveGridCard
            key={item.id || item.name}
            item={item}
            path={path}
            selected={selectedKeys.includes(getSelectionKey(path, item))}
            wsId={wsId}
            onMutationSuccess={onMutationSuccess}
            onNavigate={onNavigate}
            onPreview={onPreview}
            onRequestDelete={onRequestDelete}
            onRequestRename={onRequestRename}
            onToggleSelection={onToggleSelection}
          />
        ))}
      </div>
    </div>
  );
}

function DriveGridCard({
  item,
  onMutationSuccess,
  onNavigate,
  onPreview,
  onRequestDelete,
  onRequestRename,
  onToggleSelection,
  path,
  selected,
  wsId,
}: {
  item: StorageObject;
  path: string;
  selected: boolean;
} & Pick<
  DriveExplorerItemsProps,
  | 'wsId'
  | 'onMutationSuccess'
  | 'onNavigate'
  | 'onPreview'
  | 'onRequestDelete'
  | 'onRequestRename'
  | 'onToggleSelection'
>) {
  const t = useTranslations('ws-storage-objects');
  const folder = isFolder(item);
  const displayName = getStorageObjectDisplayName(item);
  const rowActions = {
    onMutationSuccess,
    onRequestDelete,
    onRequestRename,
    path,
    row: { original: item } as Row<StorageObject>,
    setStorageObject: onPreview,
    wsId,
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={`group relative flex h-full flex-col overflow-hidden rounded-[26px] border text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg ${
            selected
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
                checked={selected}
                onCheckedChange={(checked) =>
                  onToggleSelection?.(item, checked === true)
                }
              />
            </div>
            <div className="absolute inset-0 flex items-center justify-center p-5">
              <div className="flex h-full w-full items-center justify-center rounded-[22px] border border-dynamic-border/70 bg-background/75 shadow-inner">
                <DriveGridThumbnail wsId={wsId} path={path} item={item} />
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
                <StorageObjectRowActions {...rowActions} />
              </div>
            </div>
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent forceMount>
        <StorageObjectRowActions {...rowActions} menuOnly contextMenu />
      </ContextMenuContent>
    </ContextMenu>
  );
}
