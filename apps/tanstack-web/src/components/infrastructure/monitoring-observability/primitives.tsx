'use client';

import type { LucideIcon } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import type { MonitoringTone, MonitoringTranslator } from './types';

export const toneClasses: Record<
  MonitoringTone,
  { dot: string; soft: string; text: string }
> = {
  amber: {
    dot: 'bg-dynamic-yellow',
    soft: 'border-dynamic-yellow/30 bg-dynamic-yellow/10',
    text: 'text-dynamic-yellow',
  },
  blue: {
    dot: 'bg-dynamic-blue',
    soft: 'border-dynamic-blue/30 bg-dynamic-blue/10',
    text: 'text-dynamic-blue',
  },
  green: {
    dot: 'bg-dynamic-green',
    soft: 'border-dynamic-green/30 bg-dynamic-green/10',
    text: 'text-dynamic-green',
  },
  muted: {
    dot: 'bg-muted-foreground',
    soft: 'border-border bg-muted/30',
    text: 'text-muted-foreground',
  },
  orange: {
    dot: 'bg-dynamic-orange',
    soft: 'border-dynamic-orange/30 bg-dynamic-orange/10',
    text: 'text-dynamic-orange',
  },
  red: {
    dot: 'bg-dynamic-red',
    soft: 'border-dynamic-red/30 bg-dynamic-red/10',
    text: 'text-dynamic-red',
  },
};

export function ToneBadge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: MonitoringTone;
}) {
  return (
    <Badge
      className={cn(
        'rounded-full border px-2 py-0.5 font-medium',
        toneClasses[tone].soft,
        toneClasses[tone].text
      )}
      variant="outline"
    >
      {children}
    </Badge>
  );
}

export function MetricCard({
  label,
  meta,
  value,
}: {
  label: string;
  meta?: string;
  value: string;
}) {
  return (
    <div className="border-border/70 border-r border-b bg-background px-5 py-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-2 font-semibold text-2xl tracking-tight">{value}</p>
      {meta ? (
        <p className="mt-1 text-muted-foreground text-xs">{meta}</p>
      ) : null}
    </div>
  );
}

export function LoadingSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          className="h-12 animate-pulse rounded-md border border-border/50 bg-muted/40"
          key={index}
        />
      ))}
    </div>
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <div className="px-4 py-12 text-center text-muted-foreground text-sm">
      {label}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  t,
}: {
  message: string | undefined;
  onRetry: () => void;
  t: MonitoringTranslator;
}) {
  return (
    <section className="rounded-lg border border-dynamic-red/30 bg-dynamic-red/10 p-4 text-dynamic-red text-sm">
      <p>{message}</p>
      <Button
        className="mt-3"
        onClick={onRetry}
        size="sm"
        type="button"
        variant="outline"
      >
        {t('refresh')}
      </Button>
    </section>
  );
}

export function ModeHeader({
  Icon,
  mode,
  onRefresh,
  projectControls,
  t,
}: {
  Icon: LucideIcon;
  mode: string;
  onRefresh: () => void;
  projectControls: React.ReactNode;
  t: MonitoringTranslator;
}) {
  return (
    <div className="flex flex-col gap-3 border-border border-b pb-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-3">
        <div className="rounded-md border border-border bg-background p-2">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h2 className="font-semibold text-lg">{t(`${mode}.title`)}</h2>
          <p className="text-muted-foreground text-sm">
            {t(`${mode}.description`)}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {projectControls}
        <Button onClick={onRefresh} size="sm" type="button" variant="outline">
          {t('refresh')}
        </Button>
      </div>
    </div>
  );
}

export function MiniBars({
  emptyLabel,
  rows,
  title,
}: {
  emptyLabel: string;
  rows: Array<{ label: string; tone: MonitoringTone; value: number }>;
  title: string;
}) {
  const max = Math.max(...rows.map((row) => row.value), 0);
  const visibleRows = rows.filter((row) => row.value > 0);

  return (
    <section className="rounded-lg border border-border bg-background">
      <div className="border-border border-b px-4 py-3 font-medium text-sm">
        {title}
      </div>
      {visibleRows.length > 0 ? (
        <div className="space-y-3 p-4">
          {visibleRows.map((row) => (
            <div className="grid gap-1" key={row.label}>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate text-muted-foreground">
                  {row.label}
                </span>
                <span className="font-mono">{row.value}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'h-full rounded-full',
                    toneClasses[row.tone].dot
                  )}
                  style={{ width: `${Math.max((row.value / max) * 100, 2)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState label={emptyLabel} />
      )}
    </section>
  );
}
