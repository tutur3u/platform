'use client';

import {
  ChevronLeft,
  ChevronRight,
  Download,
  Info,
  Link,
  X,
} from '@tuturuuu/icons';
import type { StorageObject } from '@tuturuuu/types/primitives/StorageObject';
import { Button } from '@tuturuuu/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@tuturuuu/ui/dialog';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { type KeyboardEvent, useState } from 'react';
import { DriveItemIcon } from './drive-item-icon';
import type { DriveItemActions } from './drive-item-menu';
import { DrivePreviewDetails } from './drive-preview-details';
import { DrivePreviewMedia } from './drive-preview-media';
import { getStorageObjectDisplayName } from './storage-display-name';

export function DrivePreviewViewer({
  actions,
  files,
  folderLabel,
  index,
  onClose,
  onIndexChange,
  path,
  wsId,
}: {
  actions: DriveItemActions;
  files: StorageObject[];
  folderLabel: string;
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
  path: string;
  wsId: string;
}) {
  const t = useTranslations('drive');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const file = files[index];
  if (!file) return null;

  const name = getStorageObjectDisplayName(file);
  const hasPrevious = index > 0;
  const hasNext = index < files.length - 1;
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement) return;
    if (event.key === 'ArrowLeft' && hasPrevious) onIndexChange(index - 1);
    if (event.key === 'ArrowRight' && hasNext) onIndexChange(index + 1);
  };

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent
        aria-describedby={undefined}
        className="flex h-dvh max-h-none w-screen max-w-none! flex-col gap-0 rounded-none border-0 p-0 sm:max-w-none lg:flex-row"
        onKeyDown={onKeyDown}
        showCloseButton={false}
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-muted">
          <header className="flex items-center gap-2 border-border border-b bg-card px-3 py-2">
            <Button
              aria-label={t('preview.close')}
              onClick={onClose}
              size="icon"
              type="button"
              variant="ghost"
            >
              <X className="size-4" />
            </Button>
            <DriveItemIcon
              className="hidden size-8 rounded-lg sm:inline-flex"
              iconClassName="size-4"
              item={file}
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <DialogTitle className="truncate text-sm">{name}</DialogTitle>
              <span className="truncate text-muted-foreground text-xs">
                {t('preview.position', {
                  current: index + 1,
                  total: files.length,
                  folder: folderLabel,
                })}
              </span>
            </div>
            <Button
              onClick={() => actions.onShare(file)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Link className="size-4" />
              <span className="hidden sm:inline">{t('actions.share')}</span>
            </Button>
            <Button
              onClick={() => actions.onDownload([file])}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Download className="size-4" />
              <span className="hidden sm:inline">{t('actions.download')}</span>
            </Button>
            <Button
              aria-label={t('details.title')}
              aria-pressed={detailsOpen}
              className="lg:hidden"
              onClick={() => setDetailsOpen((open) => !open)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Info className="size-4" />
            </Button>
          </header>
          <div className="relative flex min-h-0 flex-1 items-center gap-2 p-2 md:p-4">
            <Button
              aria-label={t('preview.previous')}
              className="absolute left-2 z-10 md:static"
              disabled={!hasPrevious}
              onClick={() => onIndexChange(index - 1)}
              size="icon"
              type="button"
              variant="secondary"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div className="flex size-full min-h-0 min-w-0 flex-1">
              <DrivePreviewMedia
                file={file}
                onDownload={() => actions.onDownload([file])}
                path={path}
                wsId={wsId}
              />
            </div>
            <Button
              aria-label={t('preview.next')}
              className="absolute right-2 z-10 md:static"
              disabled={!hasNext}
              onClick={() => onIndexChange(index + 1)}
              size="icon"
              type="button"
              variant="secondary"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
        <div
          className={cn(
            'max-h-[45dvh] lg:flex lg:max-h-none',
            detailsOpen ? 'flex' : 'hidden'
          )}
        >
          <DrivePreviewDetails actions={actions} file={file} path={path} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
