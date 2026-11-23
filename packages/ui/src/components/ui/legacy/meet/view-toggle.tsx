'use client';

import { Grid3x3, Rows3 } from '@tuturuuu/icons';
import { ToggleGroup, ToggleGroupItem } from '@tuturuuu/ui/toggle-group';
import { useTranslations } from 'next-intl';

interface ViewToggleProps {
  currentView: 'grid' | 'list';
  onViewChange: (view: 'grid' | 'list') => void;
}

export default function ViewToggle({
  currentView,
  onViewChange,
}: ViewToggleProps) {
  const t = useTranslations('common');

  return (
    <ToggleGroup
      aria-label={t('view')}
      className="w-fit gap-0.5 bg-muted p-0.5"
      onValueChange={(value) => {
        if (value === 'grid' || value === 'list') onViewChange(value);
      }}
      size="sm"
      type="single"
      value={currentView}
      variant="default"
    >
      <ToggleGroupItem
        aria-label={t('grid_view')}
        className="gap-2 px-3"
        value="grid"
      >
        <Grid3x3 aria-hidden className="size-4" />
        <span className="hidden sm:inline">{t('grid')}</span>
      </ToggleGroupItem>
      <ToggleGroupItem
        aria-label={t('list_view')}
        className="gap-2 px-3"
        value="list"
      >
        <Rows3 aria-hidden className="size-4" />
        <span className="hidden sm:inline">{t('list')}</span>
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
