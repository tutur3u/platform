import type { StorageObject } from '@tuturuuu/types/primitives/StorageObject';
import { formatBytes } from '@tuturuuu/utils/format';
import { useFormatter, useTranslations } from 'next-intl';
import { useCallback } from 'react';
import type { DriveItemActions } from './drive-item-menu';
import { getDriveItemKind } from './drive-item-icon';

export interface DriveCollectionProps {
  actions: DriveItemActions;
  files: StorageObject[];
  folders: StorageObject[];
  isSelected: (item: StorageObject) => boolean;
  onNavigate: (folderName: string) => void;
  onToggle: (item: StorageObject, checked: boolean) => void;
  path: string;
  wsId: string;
}

export function isFolder(item: StorageObject) {
  return !item.id;
}

export function getItemSize(item: StorageObject) {
  const size = item.metadata?.size;
  return typeof size === 'number' ? size : 0;
}

/** Short labels shared by cards, rows and the preview details. */
export function useDriveItemFormat() {
  const t = useTranslations('drive');
  const format = useFormatter();

  const date = useCallback(
    (value?: string | null) =>
      value
        ? format.dateTime(new Date(value), {
            dateStyle: 'medium',
            timeStyle: 'short',
          })
        : '—',
    [format]
  );
  const kind = useCallback(
    (item: StorageObject) => t(`kinds.${getDriveItemKind(item)}`),
    [t]
  );
  const meta = useCallback(
    (item: StorageObject) =>
      isFolder(item)
        ? t('kinds.folder')
        : `${t(`kinds.${getDriveItemKind(item)}`)} · ${formatBytes(getItemSize(item))}`,
    [t]
  );

  return {
    date,
    kind,
    meta,
    size: (item: StorageObject) => formatBytes(getItemSize(item)),
  };
}
