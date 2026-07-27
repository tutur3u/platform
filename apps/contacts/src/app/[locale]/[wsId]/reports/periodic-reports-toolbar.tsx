'use client';

import {
  ArrowDownAZ,
  ArrowUpDown,
  ListFilter,
  RotateCcw,
  Search,
} from '@tuturuuu/icons';
import type {
  PeriodicReportCadence,
  PeriodicReportDeliveryStatus,
} from '@tuturuuu/internal-api/reports';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';

const cadences: PeriodicReportCadence[] = [
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
];

export type PeriodicApprovalFilter =
  | 'all'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED';
export type PeriodicDeliveryFilter = 'all' | PeriodicReportDeliveryStatus;
export type PeriodicSortBy = 'period' | 'title' | 'updated' | 'user';
export type PeriodicSortDirection = 'asc' | 'desc';

export function PeriodicReportsToolbar({
  approvalStatus,
  cadence,
  deliveryStatus,
  onApprovalStatusChange,
  onCadenceChange,
  onDeliveryStatusChange,
  onQueryChange,
  onReset,
  onSortChange,
  query,
  sortBy,
  sortDirection,
}: {
  approvalStatus: PeriodicApprovalFilter;
  cadence: PeriodicReportCadence;
  deliveryStatus: PeriodicDeliveryFilter;
  onApprovalStatusChange: (value: PeriodicApprovalFilter) => void;
  onCadenceChange: (value: PeriodicReportCadence) => void;
  onDeliveryStatusChange: (value: PeriodicDeliveryFilter) => void;
  onQueryChange: (value: string) => void;
  onReset: () => void;
  onSortChange: (
    sortBy: PeriodicSortBy,
    sortDirection: PeriodicSortDirection
  ) => void;
  query: string;
  sortBy: PeriodicSortBy;
  sortDirection: PeriodicSortDirection;
}) {
  const t = useTranslations();
  const reportsT = useTranslations('reports-hub');
  const activeFilterCount = [
    approvalStatus !== 'all',
    deliveryStatus !== 'all',
  ].filter(Boolean).length;
  const sortValue = `${sortBy}:${sortDirection}`;

  return (
    <div className="space-y-2">
      <div className="flex min-w-0 items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            className="pl-9"
            placeholder={reportsT('search_periodic')}
          />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="relative shrink-0"
              aria-label={t('common.filters')}
            >
              <ListFilter className="h-4 w-4" />
              {activeFilterCount > 0 ? (
                <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary font-semibold text-[10px] text-primary-foreground">
                  {activeFilterCount}
                </span>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-sm">{t('common.filters')}</p>
              {activeFilterCount > 0 ? (
                <Button variant="ghost" size="xs" onClick={onReset}>
                  <RotateCcw className="h-4 w-4" />
                  {t('common.reset')}
                </Button>
              ) : null}
            </div>
            <FilterSelect
              label={t('post-email-data-table.approval_status')}
              value={approvalStatus}
              onValueChange={(value) =>
                onApprovalStatusChange(value as PeriodicApprovalFilter)
              }
              options={['all', 'PENDING', 'APPROVED', 'REJECTED']}
              allLabel={t('common.all')}
            />
            <FilterSelect
              label={t('post-email-data-table.delivery_status')}
              value={deliveryStatus}
              onValueChange={(value) =>
                onDeliveryStatusChange(value as PeriodicDeliveryFilter)
              }
              options={[
                'all',
                'draft',
                'queued',
                'processing',
                'sent',
                'failed',
                'blocked',
                'cancelled',
              ]}
              allLabel={t('common.all')}
            />
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="shrink-0"
              aria-label={t('common.sort')}
            >
              <ArrowUpDown className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 space-y-3">
            <p className="font-medium text-sm">{t('common.sort')}</p>
            <Select
              value={sortValue}
              onValueChange={(value) => {
                const [nextSortBy, nextDirection] = value.split(':');
                onSortChange(
                  nextSortBy as PeriodicSortBy,
                  nextDirection as PeriodicSortDirection
                );
              }}
            >
              <SelectTrigger>
                <ArrowDownAZ className="h-4 w-4" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  [
                    ['period:desc', t('common.date'), t('common.descending')],
                    ['period:asc', t('common.date'), t('common.ascending')],
                    ['title:asc', t('common.title'), t('common.ascending')],
                    ['title:desc', t('common.title'), t('common.descending')],
                    [
                      'user:asc',
                      t('user-data-table.user'),
                      t('common.ascending'),
                    ],
                    [
                      'user:desc',
                      t('user-data-table.user'),
                      t('common.descending'),
                    ],
                  ] as const
                ).map(([value, label, direction]) => (
                  <SelectItem key={value} value={value}>
                    {label} · {direction}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </PopoverContent>
        </Popover>
      </div>
      <Tabs
        value={cadence}
        onValueChange={(value) =>
          onCadenceChange(value as PeriodicReportCadence)
        }
      >
        <TabsList className="grid h-auto w-full grid-cols-4">
          {cadences.map((item) => (
            <TabsTrigger key={item} value={item} className="h-full min-w-0">
              <span className="truncate">{reportsT(item)}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}

function FilterSelect({
  allLabel,
  label,
  onValueChange,
  options,
  value,
}: {
  allLabel: string;
  label: string;
  onValueChange: (value: string) => void;
  options: string[];
  value: string;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option === 'all' ? allLabel : option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
