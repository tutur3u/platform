'use client';

import { CheckSquare } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';

interface DriveSelectionBarProps {
  count: number;
  onClearSelection: () => void;
  onDelete: () => void;
  onSelectAllVisible: () => void;
}

export function DriveSelectionBar({
  count,
  onClearSelection,
  onDelete,
  onSelectAllVisible,
}: DriveSelectionBarProps) {
  const t = useTranslations('ws-storage-objects');

  if (count === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dynamic-border/80 bg-muted/20 px-3 py-3">
      <div className="flex items-center gap-2 font-medium text-foreground text-sm">
        <CheckSquare className="h-4 w-4 text-dynamic-blue" />
        {t('bulk_selection_count', { count })}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-xl"
        onClick={onSelectAllVisible}
      >
        {t('select_all_visible')}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-xl"
        onClick={onClearSelection}
      >
        {t('deselect_all')}
      </Button>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        className="rounded-xl"
        onClick={onDelete}
      >
        {t('bulk_delete_action')}
      </Button>
    </div>
  );
}
