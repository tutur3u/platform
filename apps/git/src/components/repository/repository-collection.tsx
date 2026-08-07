'use client';

import { useDebouncedValue } from '@tanstack/react-pacer/debouncer';
import { type SortingState, useTable } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ArrowDownAZ,
  CalendarArrowDown,
  CalendarArrowUp,
  ListFilter,
  Search,
} from '@tuturuuu/icons';
import { Card } from '@tuturuuu/ui/card';
import {
  type ColumnDef,
  dataTableFeatures,
} from '@tuturuuu/ui/custom/tables/data-table';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { useMemo, useRef, useState } from 'react';
import { CollectionRowView } from './repository-collection-row';
import type { CollectionRow } from './repository-collection-types';

export type { CollectionItem } from './repository-collection-types';

const ROW_HEIGHT = 64;

const columns: ColumnDef<CollectionRow>[] = [
  { accessorKey: 'title', id: 'title' },
  {
    accessorKey: 'state',
    filterFn: (row, columnId, value) => row.getValue(columnId) === value,
    id: 'state',
  },
  { accessorKey: 'timestamp', id: 'timestamp' },
];

const SORT_OPTIONS = {
  name: [{ desc: false, id: 'title' }],
  oldest: [{ desc: false, id: 'timestamp' }],
  recent: [{ desc: true, id: 'timestamp' }],
} satisfies Record<string, SortingState>;

type SortOption = keyof typeof SORT_OPTIONS;

export function RepositoryCollection({
  emptyMessage,
  rows: data,
  owner,
  repository,
  searchQuery,
  title,
}: {
  emptyMessage: string;
  rows: CollectionRow[];
  owner: string;
  repository: string;
  searchQuery?: string;
  title: string;
}) {
  const t = useTranslations('git');
  const [search, setSearch] = useState(searchQuery ?? '');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState<SortOption>('recent');
  const [debouncedSearch] = useDebouncedValue(search, { wait: 120 });
  const statuses = useMemo(
    () => [...new Set(data.map((row) => row.state).filter(Boolean))].sort(),
    [data]
  );
  const sorting = SORT_OPTIONS[sort];
  const table = useTable({
    features: dataTableFeatures,
    columns,
    data,
    globalFilterFn: (row, _columnId, value) =>
      row.original.search.includes(String(value).trim().toLowerCase()),
    state: {
      columnFilters: status === 'all' ? [] : [{ id: 'state', value: status }],
      globalFilter: debouncedSearch,
      sorting,
    },
  });
  const rows = table.getRowModel().rows;
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => ROW_HEIGHT,
    getScrollElement: () => scrollRef.current,
    getItemKey: (index) => rows[index]?.original.key ?? index,
    initialRect: { height: 640, width: 1200 },
    overscan: 5,
  });
  const totalSize = virtualizer.getTotalSize();

  return (
    <section className="space-y-3">
      <header className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <p className="truncate font-mono text-[11px] text-muted-foreground uppercase tracking-[0.16em]">
            {owner}/{repository}
          </p>
          <div className="mt-0.5 flex items-baseline gap-2">
            <h1 className="font-semibold text-xl tracking-tight">{title}</h1>
            <span className="font-mono text-muted-foreground text-xs">
              {t('result_count', { count: rows.length })}
            </span>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 xl:max-w-3xl xl:justify-end">
          <label className="relative min-w-48 flex-1 xl:max-w-sm">
            <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={t('filter_collection', { collection: title })}
              className="h-8 pl-8 text-xs"
              name="q"
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('filter_placeholder')}
              type="search"
              value={search}
            />
          </label>

          {statuses.length > 1 && (
            <CompactSelect
              ariaLabel={t('filter_state')}
              icon={<ListFilter className="h-3.5 w-3.5" />}
              onChange={setStatus}
              value={status}
            >
              <option value="all">{t('all_states')}</option>
              {statuses.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </CompactSelect>
          )}

          <CompactSelect
            ariaLabel={t('sort')}
            icon={<SortIcon sort={sort} />}
            onChange={(value) => setSort(value as SortOption)}
            value={sort}
          >
            <option value="recent">{t('sort_recent')}</option>
            <option value="oldest">{t('sort_oldest')}</option>
            <option value="name">{t('sort_name')}</option>
          </CompactSelect>
        </div>
      </header>

      <Card className="overflow-hidden py-0">
        {rows.length ? (
          <div
            className="overflow-auto overscroll-contain"
            ref={scrollRef}
            style={{
              contain: 'strict',
              height: Math.min(Math.max(totalSize, ROW_HEIGHT), 640),
            }}
          >
            <div className="relative w-full" style={{ height: totalSize }}>
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const row = rows[virtualRow.index];
                if (!row) return null;

                return (
                  <div
                    className="absolute top-0 left-0 w-full border-b last:border-b-0"
                    key={row.original.key}
                    style={{
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <CollectionRowView row={row.original} />
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-10 text-center text-muted-foreground text-sm">
            {emptyMessage}
          </div>
        )}
      </Card>
    </section>
  );
}

function CompactSelect({
  ariaLabel,
  children,
  icon,
  onChange,
  value,
}: {
  ariaLabel: string;
  children: React.ReactNode;
  icon: React.ReactNode;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="relative flex h-8 items-center rounded-md border bg-background/60 pl-2 text-xs">
      <span className="pointer-events-none text-muted-foreground">{icon}</span>
      <select
        aria-label={ariaLabel}
        className="h-full appearance-none bg-transparent pr-7 pl-1.5 outline-none"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {children}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute right-2 text-[9px] text-muted-foreground"
      >
        ▾
      </span>
    </label>
  );
}

function SortIcon({ sort }: { sort: SortOption }) {
  if (sort === 'name') return <ArrowDownAZ className="h-3.5 w-3.5" />;
  if (sort === 'oldest') return <CalendarArrowUp className="h-3.5 w-3.5" />;
  return <CalendarArrowDown className="h-3.5 w-3.5" />;
}
