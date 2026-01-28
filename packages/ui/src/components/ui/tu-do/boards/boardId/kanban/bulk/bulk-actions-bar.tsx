'use client';

import { ArrowRightLeft, Check, MoreHorizontal } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { DropdownMenu, DropdownMenuTrigger } from '@tuturuuu/ui/dropdown-menu';
import { useTranslations } from 'next-intl';
import { BulkActionsMenu } from './bulk-actions-menu';

interface BulkActionsBarProps {
  selectedCount: number;
  isMultiSelectMode: boolean;
  bulkWorking: boolean;
  modKey: string;
  onClearSelection: () => void;
  onOpenBoardSelector: () => void;
  menuProps: React.ComponentProps<typeof BulkActionsMenu>;
}

export function BulkActionsBar({
  selectedCount,
  isMultiSelectMode,
  bulkWorking,
  modKey,
  onClearSelection,
  onOpenBoardSelector,
  menuProps,
}: BulkActionsBarProps) {
  const t = useTranslations();
  const tc = useTranslations('common');

  if (!isMultiSelectMode) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-linear-to-r from-primary/5 via-primary/3 to-transparent px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-3 text-xs md:text-sm">
        <div className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 ring-1 ring-primary/20">
          <Check className="h-3.5 w-3.5 text-primary" />
          <span className="font-semibold text-primary">
            {selectedCount}{' '}
            {selectedCount === 1 ? tc('task') : tc('tasks_plural')}
          </span>
        </div>
        <span className="hidden text-muted-foreground text-xs sm:inline">
          {tc('selection_instruction', { modKey })}
        </span>
        {bulkWorking && (
          <Badge
            variant="outline"
            className="animate-pulse border-dynamic-blue/40 text-[10px]"
          >
            {t('common.working')}
          </Badge>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              disabled={bulkWorking}
            >
              <MoreHorizontal className="mr-1 h-3 w-3" />{' '}
              {t('common.bulk_actions')}
            </Button>
          </DropdownMenuTrigger>
          <BulkActionsMenu {...menuProps} />
        </DropdownMenu>

        <Button
          variant="outline"
          size="sm"
          onClick={onOpenBoardSelector}
          className="h-6 px-2 text-xs"
          disabled={selectedCount === 0 || bulkWorking}
        >
          <ArrowRightLeft className="mr-1 h-3 w-3" />
          {t('common.move')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          className="h-6 px-2 text-xs"
          disabled={bulkWorking}
        >
          {t('common.clear')}
        </Button>
      </div>
    </div>
  );
}
