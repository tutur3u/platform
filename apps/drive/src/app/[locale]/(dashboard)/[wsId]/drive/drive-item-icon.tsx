import {
  File,
  FileArchive,
  FileCode,
  FileSpreadsheet,
  FileText,
  Folder,
  Image,
  Music,
  Video,
} from '@tuturuuu/icons';
import type { StorageObject } from '@tuturuuu/types/primitives/StorageObject';
import { cn } from '@tuturuuu/utils/format';
import {
  type DriveFileKind,
  driveKindTint,
  getDriveFileKind,
} from './drive-file-kind';

const kindIcons: Record<DriveFileKind | 'folder', typeof File> = {
  folder: Folder,
  image: Image,
  video: Video,
  audio: Music,
  pdf: FileText,
  document: FileText,
  sheet: FileSpreadsheet,
  archive: FileArchive,
  code: FileCode,
  other: File,
};

export function getDriveItemKind(item: StorageObject) {
  return item.id ? getDriveFileKind(item) : 'folder';
}

/** A tinted tile with the icon of the item's kind. */
export function DriveItemIcon({
  className,
  iconClassName,
  item,
}: {
  className?: string;
  iconClassName?: string;
  item: StorageObject;
}) {
  const kind = getDriveItemKind(item);
  const Icon = kindIcons[kind];

  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-10 shrink-0 items-center justify-center rounded-xl',
        driveKindTint[kind],
        className
      )}
    >
      <Icon className={cn('size-5', iconClassName)} />
    </span>
  );
}
