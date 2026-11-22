'use client';

import { useMutation } from '@tanstack/react-query';
import { CornerLeftUp } from '@tuturuuu/icons';
import {
  InternalApiError,
  moveWorkspaceStorageEntries,
} from '@tuturuuu/internal-api';
import type { StorageObject } from '@tuturuuu/types/primitives/StorageObject';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { DriveMoveFolderList } from './drive-move-folder-list';
import { getMoveTargetBlock } from './drive-move-target';
import { getPathSegments } from './drive-selection';
import { getStoragePathSegmentDisplayName } from './storage-display-name';

/** Maps the move route's error codes to their messages. */
export function getMoveFailureKey(error: unknown) {
  if (error instanceof InternalApiError) {
    if (error.code === 'DRIVE_MOVE_PROVIDER') return 'failed_provider';
    if (error.code === 'DRIVE_MOVE_CONFLICT') return 'failed_conflict';
    if (error.code === 'DRIVE_MOVE_SIZE' || error.status === 413)
      return 'failed_size';
    if (error.status === 404) return 'failed_missing';
  }
  return 'failed';
}

export function DriveMoveDialog({
  items,
  onMoved,
  onOpenChange,
  sourcePath,
  wsId,
}: {
  items: StorageObject[];
  onMoved: () => void | Promise<void>;
  onOpenChange: (open: boolean) => void;
  sourcePath: string;
  wsId: string;
}) {
  const t = useTranslations('drive');
  const [pickerPath, setPickerPath] = useState('');
  const segments = getPathSegments(pickerPath);
  const block = getMoveTargetBlock(sourcePath, pickerPath, items);
  const mutation = useMutation({
    mutationFn: () =>
      moveWorkspaceStorageEntries(
        wsId,
        {
          sourcePath,
          destinationPath: pickerPath,
          entries: items.map((item) => ({
            name: item.name ?? '',
            isFolder: !item.id,
          })),
        },
        { fetch }
      ),
    onSuccess: async (results) => {
      const moved = results.filter(
        (result) => result.status === 'moved'
      ).length;
      if (moved === results.length)
        toast.success(t('move.moved', { count: moved }));
      else toast.warning(t('move.partial', { moved, total: results.length }));
      onOpenChange(false);
      await onMoved();
    },
    onError: (error) => toast.error(t(`move.${getMoveFailureKey(error)}`)),
  });
  const destinationLabel =
    segments.length > 0
      ? getStoragePathSegmentDisplayName(segments.at(-1) ?? '')
      : t('files');

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!mutation.isPending) onOpenChange(next);
      }}
      open
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('move.title', { count: items.length })}</DialogTitle>
          <DialogDescription>{t('move.description')}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-1 text-sm">
          {pickerPath ? (
            <Button
              aria-label={t('move.up')}
              onClick={() => setPickerPath(segments.slice(0, -1).join('/'))}
              size="icon"
              type="button"
              variant="ghost"
            >
              <CornerLeftUp className="size-4" />
            </Button>
          ) : null}
          <span className="truncate font-semibold">
            {[
              t('files'),
              ...segments.map(getStoragePathSegmentDisplayName),
            ].join(' / ')}
          </span>
        </div>
        <DriveMoveFolderList
          onOpen={setPickerPath}
          path={pickerPath}
          wsId={wsId}
        />
        {block ? (
          <p className="text-muted-foreground text-sm">
            {t(`move.blocked_${block}`)}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            disabled={mutation.isPending}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            {t('common.cancel')}
          </Button>
          <Button
            disabled={block !== null || mutation.isPending}
            onClick={() => mutation.mutate()}
            type="button"
          >
            {mutation.isPending
              ? t('move.moving')
              : t('move.confirm', { folder: destinationLabel })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
