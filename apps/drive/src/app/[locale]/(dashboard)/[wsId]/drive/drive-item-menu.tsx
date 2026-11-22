'use client';

import {
  Copy,
  Download,
  Ellipsis,
  Eye,
  FolderInput,
  FolderOpen,
  Link,
  Pencil,
  Trash2,
} from '@tuturuuu/icons';
import type { StorageObject } from '@tuturuuu/types/primitives/StorageObject';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useTranslations } from 'next-intl';
import { getStorageObjectDisplayName } from './storage-display-name';

export interface DriveItemActions {
  canManage: boolean;
  onCopyPath: (item: StorageObject) => void;
  onDelete: (items: StorageObject[]) => void;
  onDownload: (items: StorageObject[]) => void;
  onMove: (items: StorageObject[]) => void;
  onOpen: (item: StorageObject) => void;
  onRename: (item: StorageObject) => void;
  onShare: (item: StorageObject) => void;
}

export function DriveItemMenu({
  actions,
  item,
}: {
  actions: DriveItemActions;
  item: StorageObject;
}) {
  const t = useTranslations('drive');
  const isFile = Boolean(item.id);
  const name = getStorageObjectDisplayName(item);

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={t('actions.more', { name })}
          className="relative z-10 size-8 shrink-0"
          size="icon"
          type="button"
          variant="ghost"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <Ellipsis className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-52"
        onClick={(event) => event.stopPropagation()}
      >
        <DropdownMenuItem onSelect={() => actions.onOpen(item)}>
          {isFile ? <Eye /> : <FolderOpen />}
          {isFile ? t('actions.preview') : t('actions.open')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.onShare(item)}>
          <Link />
          {t('actions.share')}
        </DropdownMenuItem>
        {isFile ? (
          <DropdownMenuItem onSelect={() => actions.onDownload([item])}>
            <Download />
            {t('actions.download')}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={() => actions.onCopyPath(item)}>
          <Copy />
          {t('actions.copy_path')}
        </DropdownMenuItem>
        {actions.canManage ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => actions.onRename(item)}>
              <Pencil />
              {t('actions.rename')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => actions.onMove([item])}>
              <FolderInput />
              {t('actions.move')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => actions.onDelete([item])}
              variant="destructive"
            >
              <Trash2 />
              {t('actions.delete_forever')}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
