'use client';

import {
  ArrowRightLeft,
  Check,
  Loader2,
  MoreHorizontal,
  X,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { DropdownMenu, DropdownMenuTrigger } from '@tuturuuu/ui/dropdown-menu';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { ComponentProps } from 'react';
import { BulkActionsMenu } from './bulk-actions-menu';

interface BulkActionsIslandProps {
  selectedCount: number;
  bulkWorking: boolean;
  onClearSelection: () => void;
  onOpenBoardSelector: () => void;
  menuProps: ComponentProps<typeof BulkActionsMenu>;
}

export function BulkActionsIsland({
  selectedCount,
  bulkWorking,
  onClearSelection,
  onOpenBoardSelector,
  menuProps,
}: BulkActionsIslandProps) {
  const t = useTranslations();
  const tc = useTranslations('common');

  if (selectedCount <= 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-3 bottom-4 z-40 flex justify-center sm:bottom-6"
      data-testid="kanban-bulk-actions-island"
    >
      <div
        className={cn(
          'pointer-events-auto flex max-w-[calc(100vw-1.5rem)] items-center gap-1.5 rounded-2xl border border-border/70 bg-background/95 p-1.5 shadow-xl backdrop-blur-xl',
          'transition-[opacity,transform] duration-200 ease-out'
        )}
      >
        <div className="flex min-w-0 items-center gap-2 rounded-xl bg-muted/60 px-2.5 py-1.5">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            {bulkWorking ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
          </span>
          <span className="whitespace-nowrap font-semibold text-sm">
            {selectedCount}{' '}
            {selectedCount === 1 ? tc('task') : tc('tasks_plural')}
          </span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 gap-1.5 rounded-xl px-2.5"
              disabled={bulkWorking}
              aria-label={t('common.bulk_actions')}
            >
              <MoreHorizontal className="h-4 w-4" />
              <span className="hidden sm:inline">
                {t('common.bulk_actions')}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <BulkActionsMenu {...menuProps} />
        </DropdownMenu>

        <Button
          variant="ghost"
          size="sm"
          onClick={onOpenBoardSelector}
          className="h-9 gap-1.5 rounded-xl px-2.5"
          disabled={bulkWorking}
          aria-label={t('common.move')}
        >
          <ArrowRightLeft className="h-4 w-4" />
          <span className="hidden sm:inline">{t('common.move')}</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          className="h-9 gap-1.5 rounded-xl px-2.5"
          disabled={bulkWorking}
          aria-label={t('common.clear')}
        >
          <X className="h-4 w-4" />
          <span className="hidden sm:inline">{t('common.clear')}</span>
        </Button>
      </div>
    </div>
  );
}
