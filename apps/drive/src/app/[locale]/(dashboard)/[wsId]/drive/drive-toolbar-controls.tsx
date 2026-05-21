'use client';

import { ArrowDown, ArrowUp, LayoutGrid, LayoutList } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import {
  type DriveSortBy,
  type DriveViewMode,
  driveSortByValues,
  driveViewModes,
} from './search-params';

export function SortBySelect({
  onChange,
  value,
}: {
  onChange: (value: DriveSortBy) => void;
  value: DriveSortBy;
}) {
  const t = useTranslations('ws-storage-objects');

  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as DriveSortBy)}
    >
      <SelectTrigger className="h-11 rounded-2xl border-dynamic-border/80 bg-background">
        <SelectValue placeholder={t('sort_by_label')} />
      </SelectTrigger>
      <SelectContent>
        {driveSortByValues.map((sortBy) => (
          <SelectItem key={sortBy} value={sortBy}>
            {t(`sort_options.${sortBy}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function SortOrderSelect({
  onChange,
  value,
}: {
  onChange: (value: 'asc' | 'desc') => void;
  value: 'asc' | 'desc';
}) {
  const t = useTranslations('ws-storage-objects');

  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as 'asc' | 'desc')}
    >
      <SelectTrigger className="h-11 rounded-2xl border-dynamic-border/80 bg-background">
        <SelectValue placeholder={t('sort_direction')} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="desc">
          <div className="flex items-center gap-2">
            <ArrowDown className="h-4 w-4" />
            {t('sort_desc')}
          </div>
        </SelectItem>
        <SelectItem value="asc">
          <div className="flex items-center gap-2">
            <ArrowUp className="h-4 w-4" />
            {t('sort_asc')}
          </div>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

export function ViewModeToggle({
  onChange,
  value,
}: {
  onChange: (value: DriveViewMode) => void;
  value: DriveViewMode;
}) {
  const t = useTranslations('ws-storage-objects');

  return (
    <div className="flex items-center rounded-2xl border border-dynamic-border/80 bg-background p-1">
      {driveViewModes.map((viewMode) => {
        const Icon = viewMode === 'grid' ? LayoutGrid : LayoutList;
        return (
          <Button
            key={viewMode}
            type="button"
            variant={value === viewMode ? 'default' : 'ghost'}
            className="h-9 rounded-xl"
            onClick={() => onChange(viewMode)}
          >
            <Icon className="mr-2 h-4 w-4" />
            {viewMode === 'grid' ? t('grid_view') : t('list_view')}
          </Button>
        );
      })}
    </div>
  );
}
