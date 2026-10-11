'use client';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  type SavedLibraryOrder,
  savedLibraryOrders,
} from './saved-library-ordering';

const availabilityOptions = ['all', 'available', 'unavailable'] as const;
export type SavedLibraryFilters = {
  search: string;
  order: SavedLibraryOrder;
  availability: (typeof availabilityOptions)[number];
};
const initialFilters: SavedLibraryFilters = {
  search: '',
  availability: 'all',
  order: 'newest',
};
export function useSavedLibraryFilters() {
  return useState(initialFilters);
}
const normalize = (value: string) => value.normalize('NFKC').toLowerCase();
export function matchesSavedLibrary(
  filters: SavedLibraryFilters,
  title: string | null,
  available: boolean
) {
  if (filters.availability === 'available' && !available) return false;
  if (filters.availability === 'unavailable' && available) return false;
  const search = normalize(filters.search.trim().slice(0, 100));
  return (
    !search ||
    (available && title !== null && normalize(title).includes(search))
  );
}
export function SavedLibraryFilterControls({
  filters,
  onChange,
}: {
  filters: SavedLibraryFilters;
  onChange: (filters: SavedLibraryFilters) => void;
}) {
  const t = useTranslations('lettin');
  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <label className="block space-y-2">
        {t('savedLibrarySearch')}
        <input
          type="search"
          className="w-full rounded-md border border-input bg-background p-2"
          value={filters.search}
          maxLength={100}
          onChange={(event) =>
            onChange({ ...filters, search: event.target.value.slice(0, 100) })
          }
        />
      </label>
      <label className="block space-y-2">
        {t('savedLibraryAvailability')}
        <select
          className="w-full rounded-md border border-input bg-background p-2"
          value={filters.availability}
          onChange={(event) => {
            const availability = event.target.value;
            if (availabilityOptions.some((option) => option === availability))
              onChange({
                ...filters,
                availability:
                  availability as SavedLibraryFilters['availability'],
              });
          }}
        >
          {availabilityOptions.map((value) => (
            <option key={value} value={value}>
              {t(`savedLibraryAvailability_${value}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-2">
        {t('savedLibraryOrder')}
        <select
          className="w-full rounded-md border border-input bg-background p-2"
          value={filters.order}
          onChange={(event) => {
            const order = event.target.value;
            if (savedLibraryOrders.some((option) => option === order))
              onChange({ ...filters, order: order as SavedLibraryOrder });
          }}
        >
          {savedLibraryOrders.map((value) => (
            <option key={value} value={value}>
              {t(`savedLibraryOrder_${value}`)}
            </option>
          ))}
        </select>
      </label>
      <p className="text-muted-foreground text-sm">
        {t('savedLibraryFilterHint')}
      </p>
      {(filters.search ||
        filters.availability !== 'all' ||
        filters.order !== 'newest') && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => onChange(initialFilters)}
        >
          {t('savedLibraryClearFilters')}
        </Button>
      )}
    </div>
  );
}
