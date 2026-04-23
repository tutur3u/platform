'use client';

import { ChevronLeft, ChevronRight } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Separator } from '@tuturuuu/ui/separator';
import { cn } from '@tuturuuu/utils/format';
import type { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

export const PAGE_SIZE_OPTIONS = ['10', '25', '50'] as const;

export type MonitoringTranslations = ReturnType<typeof useTranslations>;

export function FilterSelect({
  label,
  onValueChange,
  options,
  value,
}: {
  label: string;
  onValueChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground uppercase tracking-[0.2em]">
        {label}
      </p>
      <Select onValueChange={onValueChange} value={value}>
        <SelectTrigger className="h-11 rounded-2xl border-border/60 bg-background/90">
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function SummaryMetricCard({
  icon,
  label,
  meta,
  value,
}: {
  icon: ReactNode;
  label: string;
  meta: string;
  value: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-border/60 bg-background/75 p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-[0.16em]">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-3 font-semibold text-2xl">{value}</div>
      <div className="mt-1 text-muted-foreground text-xs">{meta}</div>
    </div>
  );
}

export function MicroPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-full border border-border/60 bg-background/85 px-3 py-1 text-xs">
      <span className="text-muted-foreground">{label}</span>{' '}
      <span className="font-medium">{value}</span>
    </div>
  );
}

export function EmptyFilteredState({
  actionLabel,
  description,
  onReset,
}: {
  actionLabel: string;
  description: string;
  onReset: () => void;
}) {
  return (
    <div className="rounded-[1.75rem] border border-border/60 border-dashed bg-background/60 px-6 py-10 text-center">
      <p className="text-muted-foreground text-sm">{description}</p>
      <Button className="mt-4 rounded-full" onClick={onReset} variant="outline">
        {actionLabel}
      </Button>
    </div>
  );
}

export function StatusBadge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: 'destructive' | 'neutral' | 'warning';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 font-medium text-xs',
        tone === 'destructive'
          ? 'border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red'
          : tone === 'warning'
            ? 'border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange'
            : 'border-border/70 bg-background/80 text-foreground'
      )}
    >
      {children}
    </span>
  );
}

export function PaginationSummary({
  currentPage,
  filteredCount,
  pageSize,
  totalCount,
  t,
}: {
  currentPage: number;
  filteredCount: number;
  pageSize: number;
  totalCount: number;
  t: MonitoringTranslations;
}) {
  if (filteredCount === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {t('explorer.empty_page')}
      </p>
    );
  }

  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(start + pageSize - 1, filteredCount);

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="font-medium text-sm">
          {t('explorer.showing_range', {
            end,
            start,
            total: filteredCount,
          })}
        </p>
        <p className="text-muted-foreground text-xs">
          {t('explorer.filtered_from_total', {
            filtered: filteredCount,
            total: totalCount,
          })}
        </p>
      </div>
      <Separator
        className="hidden md:block md:h-8 md:w-px"
        orientation="vertical"
      />
      <div className="text-muted-foreground text-sm">
        {t('explorer.page_indicator', {
          current: currentPage,
          total: getTotalPages(filteredCount, pageSize),
        })}
      </div>
    </div>
  );
}

export function ExplorerPagination({
  currentPage,
  onNextPage,
  onPreviousPage,
  totalItems,
  totalPages,
  t,
}: {
  currentPage: number;
  onNextPage: () => void;
  onPreviousPage: () => void;
  totalItems: number;
  totalPages: number;
  t: MonitoringTranslations;
}) {
  const isPreviousDisabled = currentPage <= 1;
  const isNextDisabled = currentPage >= totalPages || totalItems === 0;

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="text-muted-foreground text-sm">
        {t('explorer.page_indicator', {
          current: totalItems === 0 ? 0 : currentPage,
          total: totalItems === 0 ? 0 : totalPages,
        })}
      </div>
      <div className="flex items-center gap-2">
        <Button
          className="rounded-full"
          disabled={isPreviousDisabled}
          onClick={onPreviousPage}
          size="sm"
          variant="outline"
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          {t('explorer.previous_page')}
        </Button>
        <Button
          className="rounded-full"
          disabled={isNextDisabled}
          onClick={onNextPage}
          size="sm"
          variant="outline"
        >
          {t('explorer.next_page')}
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function getTotalPages(totalItems: number, pageSize: number) {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

export function getSafePage(
  page: number,
  totalItems: number,
  pageSize: number
) {
  return Math.min(Math.max(page, 1), getTotalPages(totalItems, pageSize));
}

export function paginateItems<T>(items: T[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}
