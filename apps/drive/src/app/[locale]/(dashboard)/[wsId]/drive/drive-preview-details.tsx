'use client';

import { Copy, FolderInput, Pencil, Trash2 } from '@tuturuuu/icons';
import type { StorageObject } from '@tuturuuu/types/primitives/StorageObject';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { getFileExtension } from './drive-file-kind';
import type { DriveItemActions } from './drive-item-menu';
import { getPathSegments } from './drive-selection';
import { DriveLinkNotice } from './drive-link-notice';
import { useDriveItemFormat } from './drive-view-helpers';
import { getStoragePathSegmentDisplayName } from './storage-display-name';

export function DrivePreviewDetails({
  actions,
  file,
  path,
}: {
  actions: DriveItemActions;
  file: StorageObject;
  path: string;
}) {
  const t = useTranslations('drive');
  const format = useDriveItemFormat();
  const extension = getFileExtension(file.name).toUpperCase();
  const location = [
    t('files'),
    ...getPathSegments(path).map(getStoragePathSegmentDisplayName),
  ].join(' / ');
  const fullPath = path ? `${path}/${file.name}` : (file.name ?? '');
  const rows: [string, string][] = [
    [
      t('details.type'),
      extension ? `${format.kind(file)} (${extension})` : format.kind(file),
    ],
    [t('details.size'), format.size(file)],
    [t('details.location'), location],
    [t('details.modified'), format.date(file.updated_at)],
    [t('details.created'), format.date(file.created_at)],
  ];

  return (
    <aside
      aria-label={t('details.title')}
      className="flex w-full flex-col gap-5 overflow-y-auto border-border bg-card p-5 lg:w-80 lg:border-l"
    >
      <h2 className="font-bold text-base">{t('details.title')}</h2>
      <DriveLinkNotice />
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
        {rows.map(([label, value]) => (
          <div className="contents" key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <section className="space-y-2">
        <h3 className="font-bold text-muted-foreground text-sm">
          {t('details.path')}
        </h3>
        <div className="flex items-center gap-2 rounded-xl bg-muted p-2">
          <code className="min-w-0 flex-1 break-all text-xs">{fullPath}</code>
          <Button
            aria-label={t('actions.copy_path')}
            onClick={() => actions.onCopyPath(file)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Copy className="size-4" />
          </Button>
        </div>
      </section>
      {actions.canManage ? (
        <div className="mt-auto flex flex-wrap gap-2">
          <Button
            onClick={() => actions.onRename(file)}
            size="sm"
            type="button"
            variant="outline"
          >
            <Pencil className="size-4" />
            {t('actions.rename')}
          </Button>
          <Button
            onClick={() => actions.onMove([file])}
            size="sm"
            type="button"
            variant="outline"
          >
            <FolderInput className="size-4" />
            {t('actions.move')}
          </Button>
          <Button
            className="text-destructive"
            onClick={() => actions.onDelete([file])}
            size="sm"
            type="button"
            variant="outline"
          >
            <Trash2 className="size-4" />
            {t('actions.delete_forever')}
          </Button>
        </div>
      ) : null}
    </aside>
  );
}
