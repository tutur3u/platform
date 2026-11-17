'use client';

import { CheckSquare } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { FloatingBar } from '@tuturuuu/ui/floating-bar';
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

  const selection = t('bulk_selection_count', { count });

  // Inline in the page, so it keeps the bar's shape without floating chrome.
  return (
    <FloatingBar
      aria-label={selection}
      className="w-fit flex-wrap bg-muted/20 shadow-none ring-dynamic-border/80 backdrop-blur-none"
    >
      <div className="flex items-center gap-2 px-2 font-medium text-foreground text-sm">
        <CheckSquare className="h-4 w-4 text-dynamic-blue" />
        {selection}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onSelectAllVisible}
      >
        {t('select_all_visible')}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onClearSelection}
      >
        {t('deselect_all')}
      </Button>
      <Button type="button" variant="destructive" size="sm" onClick={onDelete}>
        {t('bulk_delete_action')}
      </Button>
    </FloatingBar>
  );
}
