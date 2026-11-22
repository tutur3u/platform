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
import { ToggleGroup, ToggleGroupItem } from '@tuturuuu/ui/toggle-group';
import { useTranslations } from 'next-intl';
import { type DriveTypeFilter, driveTypeFilters } from './drive-file-kind';
import {
  type DriveSearchState,
  type DriveSearchUpdate,
  type DriveSortBy,
  driveSortByValues,
} from './search-params';

interface DriveFilterBarProps {
  onChange: (update: DriveSearchUpdate) => void;
  searchState: DriveSearchState;
}

export function DriveFilterBar({ onChange, searchState }: DriveFilterBarProps) {
  const t = useTranslations('drive');
  const ascending = searchState.sortOrder === 'asc';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="-mx-1 min-w-0 flex-1 overflow-x-auto px-1 py-1">
        <ToggleGroup
          aria-label={t('filters.type_label')}
          className="w-max justify-start gap-1"
          onValueChange={(value) =>
            onChange({
              type: driveTypeFilters.includes(value as DriveTypeFilter)
                ? (value as DriveTypeFilter)
                : null,
            })
          }
          size="sm"
          type="single"
          value={searchState.type ?? ''}
          variant="outline"
        >
          {driveTypeFilters.map((type) => (
            <ToggleGroupItem
              className="rounded-full! border-l! px-3"
              key={type}
              value={type}
            >
              {t(`chips.${type}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="flex items-center gap-2">
        <Select
          onValueChange={(value) => onChange({ sortBy: value as DriveSortBy })}
          value={searchState.sortBy}
        >
          <SelectTrigger
            aria-label={t('filters.sort_label')}
            className="h-9 w-40"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {driveSortByValues.map((sortBy) => (
              <SelectItem key={sortBy} value={sortBy}>
                {t(`filters.sort.${sortBy}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          aria-label={
            ascending ? t('filters.order_asc') : t('filters.order_desc')
          }
          onClick={() => onChange({ sortOrder: ascending ? 'desc' : 'asc' })}
          size="icon"
          type="button"
          variant="ghost"
        >
          {ascending ? (
            <ArrowUp className="size-4" />
          ) : (
            <ArrowDown className="size-4" />
          )}
        </Button>
        <ToggleGroup
          aria-label={t('filters.view_label')}
          onValueChange={(value) => {
            if (value === 'grid' || value === 'list') onChange({ view: value });
          }}
          size="sm"
          type="single"
          value={searchState.view}
          variant="default"
        >
          <ToggleGroupItem aria-label={t('filters.grid')} value="grid">
            <LayoutGrid className="size-4" />
          </ToggleGroupItem>
          <ToggleGroupItem aria-label={t('filters.list')} value="list">
            <LayoutList className="size-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  );
}
