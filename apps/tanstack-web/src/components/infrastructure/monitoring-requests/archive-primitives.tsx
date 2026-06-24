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
import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';
import type { useTranslations } from 'use-intl';

export type MonitoringRequestsTranslations = ReturnType<typeof useTranslations>;

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
        <SelectTrigger className="h-11 rounded-lg border-border/60 bg-background/90">
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
    <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-[0.16em]">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-3 font-semibold text-2xl">{value}</div>
      <div className="mt-1 text-muted-foreground text-xs">{meta}</div>
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
            : 'border-border/70 bg-background text-foreground'
      )}
    >
      {children}
    </span>
  );
}

export function EmptyArchiveState({
  actionLabel,
  description,
  onReset,
}: {
  actionLabel: string;
  description: string;
  onReset: () => void;
}) {
  return (
    <div className="rounded-lg border border-border/60 border-dashed bg-muted/20 px-6 py-10 text-center">
      <p className="text-muted-foreground text-sm">{description}</p>
      <Button className="mt-4 rounded-full" onClick={onReset} variant="outline">
        {actionLabel}
      </Button>
    </div>
  );
}

export function ArchivePagination({
  currentPage,
  hasNextPage,
  hasPreviousPage,
  onNextPage,
  onPreviousPage,
  t,
  totalItems,
  totalPages,
}: {
  currentPage: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  onNextPage: () => void;
  onPreviousPage: () => void;
  t: MonitoringRequestsTranslations;
  totalItems: number;
  totalPages: number;
}) {
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
          disabled={!hasPreviousPage}
          onClick={onPreviousPage}
          size="sm"
          variant="outline"
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          {t('explorer.previous_page')}
        </Button>
        <Button
          className="rounded-full"
          disabled={!hasNextPage}
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
