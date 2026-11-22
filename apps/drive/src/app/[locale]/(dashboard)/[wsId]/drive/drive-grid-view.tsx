'use client';

import type { StorageObject } from '@tuturuuu/types/primitives/StorageObject';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { getDriveFileKind } from './drive-file-kind';
import { DriveGridThumbnail } from './drive-grid-thumbnail';
import { DriveItemIcon } from './drive-item-icon';
import { DriveItemMenu } from './drive-item-menu';
import {
  type DriveCollectionProps,
  useDriveItemFormat,
} from './drive-view-helpers';
import { getStorageObjectDisplayName } from './storage-display-name';

const cardClassName =
  'group relative rounded-2xl border border-border bg-card shadow-elevation-1 transition-shadow has-[[data-state=checked]]:ring-2 has-[[data-state=checked]]:ring-ring';

function OpenButton({ label, onOpen }: { label: string; onOpen: () => void }) {
  return (
    <button
      aria-label={label}
      className="absolute inset-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
      onClick={onOpen}
      type="button"
    />
  );
}

function SelectBox({
  checked,
  item,
  onToggle,
}: {
  checked: boolean;
  item: StorageObject;
  onToggle: DriveCollectionProps['onToggle'];
}) {
  const t = useTranslations('drive');
  return (
    <Checkbox
      aria-label={t('selection.select_item', {
        name: getStorageObjectDisplayName(item),
      })}
      checked={checked}
      className={cn(
        'relative z-10 bg-card',
        !checked &&
          'md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 md:group-has-[:focus-visible]:opacity-100'
      )}
      onCheckedChange={(value) => onToggle(item, value === true)}
    />
  );
}

export function DriveFolderSection({
  actions,
  folders,
  isSelected,
  onNavigate,
  onToggle,
}: DriveCollectionProps) {
  const t = useTranslations('drive');
  const format = useDriveItemFormat();
  if (folders.length === 0) return null;

  return (
    <section aria-labelledby="drive-folders" className="space-y-3">
      <h2
        id="drive-folders"
        className="font-bold text-muted-foreground text-sm"
      >
        {t('sections.folders')}
      </h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(13.75rem,1fr))]">
        {folders.map((folder) => {
          const name = getStorageObjectDisplayName(folder);
          return (
            <li
              key={folder.name}
              className={cn(cardClassName, 'flex items-center gap-3 p-3')}
            >
              <OpenButton
                label={t('actions.open_named', { name })}
                onOpen={() => onNavigate(folder.name ?? '')}
              />
              <SelectBox
                checked={isSelected(folder)}
                item={folder}
                onToggle={onToggle}
              />
              <DriveItemIcon item={folder} />
              <span className="flex min-w-0 flex-1 flex-col">
                <strong className="truncate text-sm">{name}</strong>
                <span className="text-muted-foreground text-xs">
                  {format.meta(folder)}
                </span>
              </span>
              <DriveItemMenu actions={actions} item={folder} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function DriveFileGrid(props: DriveCollectionProps) {
  const { actions, files, isSelected, onToggle, path, wsId } = props;
  const t = useTranslations('drive');
  const format = useDriveItemFormat();

  return (
    <div className="space-y-6">
      <DriveFolderSection {...props} />
      {files.length > 0 ? (
        <section aria-labelledby="drive-files" className="space-y-3">
          <h2
            id="drive-files"
            className="font-bold text-muted-foreground text-sm"
          >
            {t('sections.files')}
          </h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(12.5rem,1fr))] md:gap-4">
            {files.map((file) => {
              const name = getStorageObjectDisplayName(file);
              const isImage = getDriveFileKind(file) === 'image';
              return (
                <li
                  key={file.id}
                  className={cn(cardClassName, 'flex flex-col gap-2 p-2')}
                >
                  <OpenButton
                    label={t('actions.preview_named', { name })}
                    onOpen={() => actions.onOpen(file)}
                  />
                  <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl bg-muted">
                    {isImage ? (
                      <DriveGridThumbnail item={file} path={path} wsId={wsId} />
                    ) : (
                      <DriveItemIcon
                        className="size-full rounded-xl"
                        iconClassName="size-9"
                        item={file}
                      />
                    )}
                    <span className="absolute top-2 left-2 flex">
                      <SelectBox
                        checked={isSelected(file)}
                        item={file}
                        onToggle={onToggle}
                      />
                    </span>
                  </div>
                  <div className="flex items-center gap-1 pb-1 pl-2">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <strong className="truncate text-sm">{name}</strong>
                      <span className="truncate text-muted-foreground text-xs">
                        {format.meta(file)}
                      </span>
                    </span>
                    <DriveItemMenu actions={actions} item={file} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
