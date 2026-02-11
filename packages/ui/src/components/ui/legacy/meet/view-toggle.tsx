'use client';

import { Grid3x3, Rows3 } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { Tabs, TabsList, TabsTrigger } from '../../tabs';

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
    <Tabs
      value={currentView}
      onValueChange={(value) => onViewChange(value as 'grid' | 'list')}
    >
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger
          value="grid"
          className="flex items-center gap-2"
          aria-label={t('grid_view')}
        >
          <Grid3x3 />
          <span className="hidden sm:inline">{t('grid')}</span>
        </TabsTrigger>

        <TabsTrigger
          value="list"
          className="flex items-center gap-2"
          aria-label={t('list_view')}
        >
          <Rows3 />
          <span className="hidden sm:inline">{t('list')}</span>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
