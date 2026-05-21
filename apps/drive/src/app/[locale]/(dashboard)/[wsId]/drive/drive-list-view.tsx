'use client';

import type { Row } from '@tanstack/react-table';
import { FileText, Folder } from '@tuturuuu/icons';
import type { StorageObject } from '@tuturuuu/types/primitives/StorageObject';
import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from '@tuturuuu/ui/context-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { formatBytes } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { getSelectionKey } from './drive-selection';
import {
  type DriveExplorerItemsProps,
  formatTimestamp,
  isFolder,
} from './drive-view-helpers';
import { StorageObjectRowActions } from './row-actions';
import { getStorageObjectDisplayName } from './storage-display-name';

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
            {items.map((item) => (
              <DriveListRow
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
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function DriveListRow({
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

  const row = (
    <TableRow
      className="cursor-pointer border-dynamic-border/70 transition-colors hover:bg-muted/25"
      onClick={() => (folder ? onNavigate(item.name || '') : onPreview(item))}
    >
      <TableCell onClick={(event) => event.stopPropagation()} className="w-12">
        <Checkbox
          aria-label={t('select_item', { name: displayName })}
          checked={selected}
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
                <div className="truncate font-medium">{displayName}</div>
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
        <StorageObjectRowActions {...rowActions} />
      </TableCell>
    </TableRow>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      <ContextMenuContent forceMount>
        <StorageObjectRowActions {...rowActions} menuOnly contextMenu />
      </ContextMenuContent>
    </ContextMenu>
  );
}
