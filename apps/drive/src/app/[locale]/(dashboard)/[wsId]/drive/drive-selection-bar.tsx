'use client';

import { Download, FolderInput, Link, Trash2, X } from '@tuturuuu/icons';
import { MAX_WORKSPACE_STORAGE_MOVE_ENTRIES } from '@tuturuuu/internal-api';
import type { StorageObject } from '@tuturuuu/types/primitives/StorageObject';
import { Button } from '@tuturuuu/ui/button';
import { FloatingBar, FloatingBarSeparator } from '@tuturuuu/ui/floating-bar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { DriveItemActions } from './drive-item-menu';

function BarAction({
  children,
  disabledReason,
  label,
  onClick,
  tone,
}: {
  children: ReactNode;
  disabledReason: string | null;
  label: string;
  onClick: () => void;
  tone?: 'destructive';
}) {
  const button = (
    <Button
      aria-label={label}
      className={tone === 'destructive' ? 'text-destructive' : undefined}
      disabled={disabledReason !== null}
      onClick={onClick}
      size="sm"
      type="button"
      variant="ghost"
    >
      {children}
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
  if (!disabledReason) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0}>{button}</span>
      </TooltipTrigger>
      <TooltipContent>{disabledReason}</TooltipContent>
    </Tooltip>
  );
}

export function DriveSelectionBar({
  actions,
  onClear,
  selected,
}: {
  actions: DriveItemActions;
  onClear: () => void;
  selected: StorageObject[];
}) {
  const t = useTranslations('drive');
  if (selected.length === 0) return null;

  const hasFolders = selected.some((item) => !item.id);
  const writeReason = actions.canManage ? null : t('denied.write_reason');
  const only = selected.length === 1 ? selected[0] : undefined;

  return (
    <FloatingBar aria-label={t('selection.toolbar')} className="max-w-full">
      <Button
        aria-label={t('selection.clear')}
        onClick={onClear}
        size="icon"
        type="button"
        variant="ghost"
      >
        <X className="size-4" />
      </Button>
      <strong aria-live="polite" className="px-2 text-sm">
        {t('selection.count', { count: selected.length })}
      </strong>
      <FloatingBarSeparator />
      <BarAction
        disabledReason={hasFolders ? t('selection.download_files_only') : null}
        label={t('actions.download')}
        onClick={() => actions.onDownload(selected)}
      >
        <Download className="size-4" />
      </BarAction>
      <BarAction
        disabledReason={only ? null : t('selection.share_one')}
        label={t('actions.share_link')}
        onClick={() => only && actions.onShare(only)}
      >
        <Link className="size-4" />
      </BarAction>
      <BarAction
        disabledReason={
          writeReason ??
          (selected.length > MAX_WORKSPACE_STORAGE_MOVE_ENTRIES
            ? t('selection.move_limit', {
                count: MAX_WORKSPACE_STORAGE_MOVE_ENTRIES,
              })
            : null)
        }
        label={t('actions.move')}
        onClick={() => actions.onMove(selected)}
      >
        <FolderInput className="size-4" />
      </BarAction>
      <FloatingBarSeparator />
      <BarAction
        disabledReason={writeReason}
        label={t('actions.delete_forever')}
        onClick={() => actions.onDelete(selected)}
        tone="destructive"
      >
        <Trash2 className="size-4" />
      </BarAction>
    </FloatingBar>
  );
}
