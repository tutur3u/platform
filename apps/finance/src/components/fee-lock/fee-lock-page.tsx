'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Lock } from '@tuturuuu/icons';
import {
  type FeeLockListQuery,
  listFeeLocks,
} from '@tuturuuu/internal-api/finance-fee-lock';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useWorkspaceUserGroups } from '@/hooks/use-workspace-user-groups';
import { formatFeeLockMonth, shiftFeeLockMonth } from './fee-lock-month';
import { FeeLockTable } from './fee-lock-table';

const ALL = 'all';
const PAGE_SIZE = 50;
const STATUSES = ['none', 'draft', 'locked'] as const;

interface Props {
  wsId: string;
  currency: string;
  initialMonth: string;
}

function FilterSelect(props: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={props.value} onValueChange={props.onChange}>
      <SelectTrigger className="w-44" aria-label={props.label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {props.options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function FeeLockPage({ wsId, currency, initialMonth }: Props) {
  const t = useTranslations('ws-fee-lock');
  const common = useTranslations('common');
  const [filters, setFilters] = useState({
    month: initialMonth,
    groupId: ALL,
    status: ALL,
    q: '',
    page: 1,
  });
  const [search, setSearch] = useState('');
  const { data: groups = [] } = useWorkspaceUserGroups(wsId);
  const update = (patch: Partial<typeof filters>) =>
    setFilters((current) => ({ ...current, page: 1, ...patch }));
  const query: FeeLockListQuery = {
    ...filters,
    groupId: filters.groupId === ALL ? undefined : filters.groupId,
    status: STATUSES.find((status) => status === filters.status),
    q: filters.q || undefined,
    pageSize: PAGE_SIZE,
  };
  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: ['fee-locks', wsId, query],
    queryFn: () => listFeeLocks(wsId, query),
    placeholderData: keepPreviousData,
  });
  const pages = Math.ceil((data?.count ?? 0) / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="flex items-center gap-2 font-semibold text-2xl">
          <Lock className="size-6" />
          {t('title')}
        </h1>
        <fieldset className="flex items-center gap-1" aria-label={t('month')}>
          {([-1, 1] as const).map((delta) => (
            <Button
              key={delta}
              variant="outline"
              size="icon"
              className={delta > 0 ? 'order-last' : undefined}
              aria-label={t(delta > 0 ? 'next_month' : 'previous_month')}
              onClick={() =>
                update({ month: shiftFeeLockMonth(filters.month, delta) })
              }
            >
              {delta > 0 ? <ChevronRight /> : <ChevronLeft />}
            </Button>
          ))}
          <span className="min-w-24 text-center font-medium tabular-nums">
            {formatFeeLockMonth(filters.month)}
          </span>
        </fieldset>
      </header>
      <div className="flex flex-wrap items-center gap-2">
        <form
          className="min-w-60 flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            update({ q: search.trim() });
          }}
        >
          <Input
            type="search"
            aria-label={t('search')}
            placeholder={t('search')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </form>
        <FilterSelect
          label={t('class_filter')}
          value={filters.groupId}
          onChange={(groupId) => update({ groupId })}
          options={[
            { value: ALL, label: t('all_classes') },
            ...groups.map((group) => ({ value: group.id, label: group.name })),
          ]}
        />
        <FilterSelect
          label={t('status')}
          value={filters.status}
          onChange={(status) => update({ status })}
          options={[
            { value: ALL, label: t('all_statuses') },
            ...STATUSES.map((value) => ({
              value,
              label: t(
                value === 'locked' ? 'status_locked_any' : `status_${value}`
              ),
            })),
          ]}
        />
      </div>
      {error ? (
        <div role="alert" className="flex items-center gap-3 text-sm">
          {t('load_error')}
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            {common('retry')}
          </Button>
        </div>
      ) : isPending ? (
        <Skeleton className="h-72 w-full" />
      ) : data?.data.length ? (
        <FeeLockTable rows={data.data} currency={currency} />
      ) : (
        <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
          {t('no_students')}
        </p>
      )}
      {pages > 1 && (
        <div className="flex items-center justify-end gap-3 text-sm">
          {([-1, 1] as const).map((delta) => (
            <Button
              key={delta}
              variant="outline"
              size="sm"
              className={delta > 0 ? 'order-last' : undefined}
              disabled={
                isFetching ||
                filters.page + delta < 1 ||
                filters.page + delta > pages
              }
              onClick={() =>
                setFilters((current) => ({
                  ...current,
                  page: current.page + delta,
                }))
              }
            >
              {common(delta > 0 ? 'next' : 'previous')}
            </Button>
          ))}
          <span className="tabular-nums">
            {filters.page}/{pages}
          </span>
        </div>
      )}
    </div>
  );
}
